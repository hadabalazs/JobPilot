import { render, h } from 'preact';
import { AuthGate } from './ui/AuthGate.js';
import { App } from './ui/App.js';
render(h(AuthGate, null, h(App)), document.getElementById('app'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
