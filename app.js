(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = 'digital-clock-preferences-v1';
  const ALARM_KEY = 'digital-clock-alarms-v1';
  const defaults = { format: '12', seconds: true, animation: true, size: 100, brightness: 100, color: '#91f5e1', background: '#101c35', font: 'space', style: 'classic', light: false, sound: false };
  let settings = { ...defaults };
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { /* use defaults if storage is unavailable or invalid */ }
  let alarms = [];
  try { alarms = JSON.parse(localStorage.getItem(ALARM_KEY) || '[]'); if (!Array.isArray(alarms)) alarms = []; } catch { alarms = []; }
  let previousMinute = '';
  let stopwatchRunning = false, stopwatchStartedAt = 0, stopwatchElapsed = 0, stopwatchFrame = 0, lapCount = 0;
  let timerInterval = 0, timerEnd = 0, timerRemaining = 0, timerRunning = false;
  let audioContext = null, ringingInterval = 0, toastTimeout = 0;
  const worldClocks = [
    { city: 'New York', zone: 'America/New_York', code: 'NYC' },
    { city: 'London', zone: 'Europe/London', code: 'LON' },
    { city: 'Tokyo', zone: 'Asia/Tokyo', code: 'TYO' },
    { city: 'Sydney', zone: 'Australia/Sydney', code: 'SYD' }
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { showToast('Could not save preferences in this browser.'); } };
  const persistAlarms = () => { try { localStorage.setItem(ALARM_KEY, JSON.stringify(alarms)); } catch { showToast('Could not save alarms in this browser.'); } };
  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 2600); }
  function hexRgb(hex) { const value = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)).join(','); }
  function applySettings() {
    document.documentElement.style.setProperty('--accent', settings.color);
    document.documentElement.style.setProperty('--accent-rgb', hexRgb(settings.color));
    document.documentElement.style.setProperty('--bg-accent', settings.background);
    document.documentElement.style.setProperty('--clock-size', String(Number(settings.size) / 100));
    document.documentElement.style.setProperty('--brightness', String(Number(settings.brightness) / 100));
    document.body.classList.toggle('light-mode', !!settings.light);
    document.body.classList.toggle('font-mono', settings.font === 'mono');
    document.body.classList.toggle('font-sans', settings.font === 'sans');
    $('#clockDisplay').classList.toggle('no-seconds', !settings.seconds);
    $('#formatSetting').value = settings.format;
    $('#secondsSetting').checked = !!settings.seconds;
    $('#animationSetting').checked = !!settings.animation;
    $('#sizeSetting').value = settings.size; $('#sizeValue').value = `${settings.size}%`;
    $('#brightnessSetting').value = settings.brightness; $('#brightnessValue').value = `${settings.brightness}%`;
    $('#colorSetting').value = settings.color; $('#backgroundSetting').value = settings.background;
    $('#fontSetting').value = settings.font;
    $('#themeToggle').textContent = settings.light ? '☾' : '☼';
    $('#soundIcon').textContent = settings.sound ? '♫' : '♪';
    $('#soundToggle').setAttribute('aria-label', settings.sound ? 'Matikan bunyi' : 'Hidupkan bunyi');
    $$('.style-option').forEach(button => button.classList.toggle('selected', button.dataset.style === settings.style));
    $('#clockDisplay').classList.remove('classic', 'led', 'neon', 'minimal', 'flip', 'future');
    $('#clockDisplay').classList.add(settings.style);
  }
  function renderClock() {
    const now = new Date();
    let hours = now.getHours();
    const isPm = hours >= 12;
    const displayHours = settings.format === '12' ? (hours % 12 || 12) : hours;
    const minute = pad(now.getMinutes());
    const hour = pad(displayHours);
    const second = pad(now.getSeconds());
    $('#hourDigits').textContent = hour;
    $('#minuteDigits').textContent = minute;
    $('#secondDigits').textContent = second;
    $('#ampmLabel').textContent = settings.format === '12' ? (isPm ? 'PM' : 'AM') : '';
    const dateText = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    $('#dateLabel').textContent = dateText;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    $('#timezoneLabel').textContent = `LOCAL · ${zone.replaceAll('_', ' ').split('/').pop().toUpperCase()}`;
    const h = now.getHours();
    $('#dayPeriod').textContent = h < 12 ? 'A fresh start to your day' : h < 18 ? 'Make this afternoon count' : 'A little more time for you';
    const minuteKey = `${now.toDateString()}-${now.getHours()}-${now.getMinutes()}`;
    if (settings.animation && previousMinute && minuteKey !== previousMinute) {
      const display = $('#clockDisplay'); display.classList.remove('animate-tick'); void display.offsetWidth; display.classList.add('animate-tick');
    }
    previousMinute = minuteKey;
    checkAlarms(now);
    updateWorldClocks(now);
  }
  function updateWorldClocks(now = new Date()) {
    worldClocks.forEach(item => {
      const time = new Intl.DateTimeFormat(undefined, { timeZone: item.zone, hour: '2-digit', minute: '2-digit', hour12: settings.format === '12' }).format(now);
      const date = new Intl.DateTimeFormat(undefined, { timeZone: item.zone, weekday: 'short', day: 'numeric', month: 'short' }).format(now);
      const clock = $(`[data-world="${item.code}"] .world-time`); const dateEl = $(`[data-world="${item.code}"] .world-date`);
      if (clock) clock.textContent = time; if (dateEl) dateEl.textContent = date;
    });
  }
  function renderWorldClocks() {
    $('#worldGrid').innerHTML = worldClocks.map(item => `<article class="world-card" data-world="${item.code}"><div class="world-city">${item.city}<span>${item.code}</span></div><div class="world-time">--:--</div><div class="world-date">--</div></article>`).join('');
    updateWorldClocks();
  }
  function ensureAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }
  function beep(frequency = 880, duration = .18) {
    if (!settings.sound) return;
    const ctx = ensureAudio(); if (!ctx) return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.13, ctx.currentTime + .02); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + duration + .02);
  }
  function checkAlarms(now) {
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const today = now.toDateString();
    const due = alarms.find(alarm => alarm.enabled && alarm.time === time && alarm.lastTriggered !== today && now.getSeconds() === 0);
    if (!due) return;
    due.lastTriggered = today; persistAlarms();
    $('#alarmOverlayTitle').textContent = due.time;
    $('#alarmOverlayMessage').textContent = due.label || 'Your alarm is ringing.';
    $('#alarmOverlay').classList.add('show');
    if (settings.sound) { beep(880, .3); ringingInterval = setInterval(() => beep(880, .3), 900); }
    renderAlarms();
  }
  function renderAlarms() {
    const list = $('#alarmList');
    list.innerHTML = alarms.length ? alarms.map(alarm => `<li class="alarm-item" data-alarm="${alarm.id}"><input type="checkbox" ${alarm.enabled ? 'checked' : ''} aria-label="Aktifkan alarm ${alarm.time}"><time>${alarm.time}</time><span class="alarm-name">${escapeHtml(alarm.label || 'Alarm')}</span><button type="button" aria-label="Padam alarm">×</button></li>`).join('') : '<li class="alarm-item"><span class="alarm-name">No alarms set yet.</span></li>';
    $('#alarmStatus').textContent = `${alarms.filter(a => a.enabled).length} SET`;
  }
  function escapeHtml(text) { return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function updateStopwatch() {
    if (!stopwatchRunning) return;
    const ms = stopwatchElapsed + (performance.now() - stopwatchStartedAt);
    const centiseconds = Math.floor(ms / 10) % 100;
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000);
    $('#stopwatchDisplay').innerHTML = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}<span>.${pad(centiseconds)}</span>`;
    stopwatchFrame = requestAnimationFrame(updateStopwatch);
  }
  function stopStopwatch() { if (stopwatchRunning) { stopwatchElapsed += performance.now() - stopwatchStartedAt; stopwatchRunning = false; cancelAnimationFrame(stopwatchFrame); } }
  function formatTimer(ms) { const total = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`; }
  function finishTimer() { clearInterval(timerInterval); timerRunning = false; timerRemaining = 0; $('#timerDisplay').textContent = '00:00:00'; $('#timerStatus').textContent = 'COMPLETE'; $('#timerStart').textContent = 'Start again'; beep(660, .35); showToast('Countdown complete.'); }
  function tickTimer() { timerRemaining = Math.max(0, timerEnd - Date.now()); $('#timerDisplay').textContent = formatTimer(timerRemaining); if (timerRemaining <= 0) finishTimer(); }
  function openSettings() { document.body.classList.add('drawer-open'); $('#settingsDrawer').setAttribute('aria-hidden', 'false'); $('#settingsClose').focus(); }
  function closeSettings() { document.body.classList.remove('drawer-open'); $('#settingsDrawer').setAttribute('aria-hidden', 'true'); $('#settingsOpen').focus(); }

  renderWorldClocks(); renderAlarms(); applySettings(); renderClock(); setInterval(renderClock, 250); $('#copyrightYear').textContent = new Date().getFullYear();
  $('#style-options');
  $$('.style-option').forEach(button => button.addEventListener('click', () => { settings.style = button.dataset.style; applySettings(); persist(); }));
  $('#settingsOpen').addEventListener('click', openSettings); $('#settingsClose').addEventListener('click', closeSettings); $('#drawerBackdrop').addEventListener('click', closeSettings);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (document.body.classList.contains('drawer-open')) closeSettings(); if ($('#alarmOverlay').classList.contains('show')) $('#alarmDismiss').click(); } });
  $('#themeToggle').addEventListener('click', () => { settings.light = !settings.light; applySettings(); persist(); });
  $('#soundToggle').addEventListener('click', () => { settings.sound = !settings.sound; if (settings.sound) { ensureAudio(); beep(660, .1); } else { clearInterval(ringingInterval); } applySettings(); persist(); });
  $('#formatSetting').addEventListener('change', event => { settings.format = event.target.value; persist(); renderClock(); });
  $('#secondsSetting').addEventListener('change', event => { settings.seconds = event.target.checked; applySettings(); persist(); });
  $('#animationSetting').addEventListener('change', event => { settings.animation = event.target.checked; persist(); });
  $('#sizeSetting').addEventListener('input', event => { settings.size = Number(event.target.value); applySettings(); persist(); });
  $('#brightnessSetting').addEventListener('input', event => { settings.brightness = Number(event.target.value); applySettings(); persist(); });
  $('#colorSetting').addEventListener('input', event => { settings.color = event.target.value; applySettings(); persist(); });
  $('#backgroundSetting').addEventListener('input', event => { settings.background = event.target.value; applySettings(); persist(); });
  $('#fontSetting').addEventListener('change', event => { settings.font = event.target.value; applySettings(); persist(); });
  $$('.swatches button').forEach(button => button.addEventListener('click', () => { settings.background = button.dataset.bg; applySettings(); persist(); }));
  $('#resetSettings').addEventListener('click', () => { settings = { ...defaults }; applySettings(); persist(); showToast('Settings reset to default.'); });
  $('#fullscreenToggle').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('Fullscreen is not available in this browser.'); } });

  $('#stopwatchStart').addEventListener('click', event => {
    if (stopwatchRunning) { stopStopwatch(); event.currentTarget.textContent = 'Resume'; $('#stopwatchStatus').textContent = 'PAUSED'; }
    else { ensureAudio(); stopwatchRunning = true; stopwatchStartedAt = performance.now(); event.currentTarget.textContent = 'Pause'; $('#stopwatchStatus').textContent = 'RUNNING'; updateStopwatch(); }
    $('#stopwatchLap').disabled = !stopwatchRunning;
  });
  $('#stopwatchLap').addEventListener('click', () => { if (!stopwatchRunning) return; lapCount++; const li = document.createElement('li'); li.innerHTML = `<span>Lap ${lapCount}</span><span>${$('#stopwatchDisplay').textContent}</span>`; $('#lapList').prepend(li); });
  $('#stopwatchReset').addEventListener('click', () => { stopStopwatch(); stopwatchElapsed = 0; lapCount = 0; $('#stopwatchDisplay').innerHTML = '00:00<span>.00</span>'; $('#stopwatchStart').textContent = 'Start'; $('#stopwatchLap').disabled = true; $('#stopwatchStatus').textContent = 'READY'; $('#lapList').innerHTML = ''; });
  $('#timerStart').addEventListener('click', event => {
    if (timerRunning) { timerRemaining = Math.max(0, timerEnd - Date.now()); clearInterval(timerInterval); timerRunning = false; $('#timerStatus').textContent = 'PAUSED'; event.currentTarget.textContent = 'Resume'; return; }
    if (timerRemaining <= 0) { const h = Math.min(99, Math.max(0, Number($('#timerHours').value) || 0)); const m = Math.min(59, Math.max(0, Number($('#timerMinutes').value) || 0)); const s = Math.min(59, Math.max(0, Number($('#timerSeconds').value) || 0)); timerRemaining = (h * 3600 + m * 60 + s) * 1000; }
    if (timerRemaining <= 0) { showToast('Choose a countdown duration first.'); return; }
    ensureAudio(); $('#timerInputs').hidden = true; $('#timerDisplay').hidden = false; timerEnd = Date.now() + timerRemaining; timerRunning = true; $('#timerStatus').textContent = 'RUNNING'; event.currentTarget.textContent = 'Pause'; tickTimer(); timerInterval = setInterval(tickTimer, 200);
  });
  $('#timerReset').addEventListener('click', () => { clearInterval(timerInterval); timerRunning = false; timerRemaining = 0; $('#timerInputs').hidden = false; $('#timerDisplay').hidden = true; $('#timerStatus').textContent = 'READY'; $('#timerStart').textContent = 'Start timer'; });
  $('#alarmForm').addEventListener('submit', event => { event.preventDefault(); const time = $('#alarmTime').value; if (!time) return; alarms.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, time, label: $('#alarmLabel').value.trim(), enabled: true, lastTriggered: '' }); alarms.sort((a, b) => a.time.localeCompare(b.time)); persistAlarms(); renderAlarms(); $('#alarmLabel').value = ''; showToast(`Alarm set for ${time}.`); });
  $('#alarmList').addEventListener('change', event => { if (event.target.matches('input[type="checkbox"]')) { const item = event.target.closest('[data-alarm]'); const alarm = alarms.find(a => a.id === item.dataset.alarm); if (alarm) { alarm.enabled = event.target.checked; persistAlarms(); renderAlarms(); } } });
  $('#alarmList').addEventListener('click', event => { if (!event.target.matches('button')) return; const item = event.target.closest('[data-alarm]'); alarms = alarms.filter(alarm => alarm.id !== item.dataset.alarm); persistAlarms(); renderAlarms(); });
  $('#alarmDismiss').addEventListener('click', () => { $('#alarmOverlay').classList.remove('show'); clearInterval(ringingInterval); });
  $$('.nav-link').forEach(link => link.addEventListener('click', () => { $$('.nav-link').forEach(other => other.classList.toggle('active', other === link)); }));
})();
