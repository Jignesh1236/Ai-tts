async function ensureContentScript(tabId) {
  try {
    // Ping the content script to see if it's alive
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true;
  } catch (e) {
    // If it fails, inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      // Wait a bit for it to initialize
      await new Promise(r => setTimeout(r, 100));
      return true;
    } catch (err) {
      console.error('Injection failed:', err);
      return false;
    }
  }
}

async function withActiveTab(cb) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) throw new Error('No active tab');
    
    const tab = tabs[0];
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
       setStatus('Cannot read this system page.');
       return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      setStatus('Please refresh the page and try again.');
      return;
    }

    return cb(tab.id);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function setProgress(index, total) {
  const pct = total > 0 ? Math.min(100, Math.round((index / total) * 100)) : 0;
  const bar = document.getElementById('progressBar');
  bar.style.width = pct + '%';
}

document.addEventListener('DOMContentLoaded', () => {
  const readBtn = document.getElementById('readBtn');
  const pickBtn = document.getElementById('pickBtn');
  const explainBtn = document.getElementById('explainBtn');
  const testVoiceBtn = document.getElementById('testVoiceBtn');
  let isSpeaking = false;
  const pauseBtn = document.getElementById('pauseBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const skipBtn = document.getElementById('skipBtn');
  const stopBtn = document.getElementById('stopBtn');
  const slowMode = document.getElementById('slowMode');
  const explainConcepts = document.getElementById('explainConcepts');
  const friendlyMode = document.getElementById('friendlyMode');
  const voiceSelect = document.getElementById('voiceSelect');
  const chatMessagesEl = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatDetail = document.getElementById('chatDetail');
  const chatDetailValue = document.getElementById('chatDetailValue');
  let chatMessages = [];
  const tabReaderBtn = document.getElementById('tabReader');
  const tabChatBtn = document.getElementById('tabChat');
  const readerTabEl = document.getElementById('readerTab');
  const chatTabEl = document.getElementById('chatTab');
  const chatPickBtn = document.getElementById('chatPickBtn');

  // --- Voice Handling ---
  function loadVoices() {
    const voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = '<option value="">Default (Auto)</option>';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
    
    const saved = localStorage.getItem('fr_voice');
    if (saved) {
      // Check if saved voice still exists
      if ([...voiceSelect.options].some(o => o.value === saved)) {
        voiceSelect.value = saved;
      }
    }
  }

  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  loadVoices();

  voiceSelect.addEventListener('change', () => {
    localStorage.setItem('fr_voice', voiceSelect.value);
  });
  
  testVoiceBtn.addEventListener('click', () => {
    try { speechSynthesis.cancel(); } catch(_) {}
    const name = voiceSelect.value;
    const voices = speechSynthesis.getVoices();
    let v = null;
    if (name) v = voices.find(x => x.name === name) || null;
    if (!v) v = voices.find(x => (x.lang || '').toLowerCase().startsWith('en')) || voices[0] || null;
    const sample = v && (v.lang || '').toLowerCase().startsWith('hi') 
      ? 'यह एक टेस्ट आवाज है। अगर आपको ये पसंद है तो इसी को चुने।' 
      : 'This is a test voice sample. If you like it, keep this voice.';
    const u = new SpeechSynthesisUtterance(sample);
    if (v) u.voice = v;
    u.rate = 1.0; u.pitch = 1.0;
    setStatus('Playing test voice...');
    u.onend = () => setStatus('Ready to read');
    try { speechSynthesis.speak(u); } catch(e) {
      setStatus('Could not play test voice');
    }
  });

  // --- Persistence ---
  slowMode.checked = localStorage.getItem('fr_slow') === 'true';
  explainConcepts.checked = localStorage.getItem('fr_explain') === 'true'; // Default OFF
  friendlyMode.checked = localStorage.getItem('fr_friendly') !== 'false'; // Default true
  chatDetail.value = parseInt(localStorage.getItem('fr_chat_detail') || '3', 10);
  chatDetailValue.textContent = chatDetail.value;

  slowMode.addEventListener('change', () => localStorage.setItem('fr_slow', slowMode.checked));
  explainConcepts.addEventListener('change', () => localStorage.setItem('fr_explain', explainConcepts.checked));
  friendlyMode.addEventListener('change', () => localStorage.setItem('fr_friendly', friendlyMode.checked));
  chatDetail.addEventListener('input', () => {
    chatDetailValue.textContent = chatDetail.value;
    localStorage.setItem('fr_chat_detail', chatDetail.value);
  });
  
  function setActiveTab(name) {
    const isReader = name === 'reader';
    readerTabEl.classList.toggle('active', isReader);
    chatTabEl.classList.toggle('active', !isReader);
    tabReaderBtn.classList.toggle('active', isReader);
    tabChatBtn.classList.toggle('active', !isReader);
    localStorage.setItem('fr_tab', name);
  }
  
  const savedTab = localStorage.getItem('fr_tab') || 'reader';
  setActiveTab(savedTab);
  tabReaderBtn.addEventListener('click', () => setActiveTab('reader'));
  tabChatBtn.addEventListener('click', () => setActiveTab('chat'));
  
  chatPickBtn.addEventListener('click', () => {
    setActiveTab('chat');
    withActiveTab(async (tabId) => {
      await chrome.tabs.sendMessage(tabId, {
        type: 'START_SELECTION_CHAT',
        options: { voiceName: voiceSelect.value }
      });
      setStatus('Select an element to ask about...');
    });
  });

  readBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      setStatus('Reading...');
      setProgress(0, 0);
      const res = await chrome.tabs.sendMessage(tabId, {
        type: 'READ_PAGE',
        options: {
          slowMode: slowMode.checked,
          explainConcepts: explainConcepts.checked,
          friendlyMode: friendlyMode.checked,
          voiceName: voiceSelect.value
        }
      });
      if (res?.ok) {
        setStatus('Started. Total chunks: ' + res.total);
        isSpeaking = true;
        toggleControls(true);
      } else {
        setStatus('Couldn\'t start: ' + (res?.error || 'Unknown error'));
      }
    });
  });

  pickBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      // Send message to start selection mode
      await chrome.tabs.sendMessage(tabId, {
        type: 'START_SELECTION',
        options: {
          slowMode: slowMode.checked,
          explainConcepts: explainConcepts.checked,
          friendlyMode: friendlyMode.checked,
          voiceName: voiceSelect.value
        }
      });
      setStatus('Select text on page...');
    });
  });
  
  explainBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      await chrome.tabs.sendMessage(tabId, {
        type: 'START_SELECTION_EXPLAIN',
        options: {
          slowMode: slowMode.checked,
          friendlyMode: friendlyMode.checked,
          voiceName: voiceSelect.value
        }
      });
      setStatus('Select an element to explain...');
    });
  });

  pauseBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      await chrome.tabs.sendMessage(tabId, { type: 'PAUSE' });
      setStatus('Paused');
    });
  });

  resumeBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      await chrome.tabs.sendMessage(tabId, { type: 'RESUME' });
      setStatus('Resumed');
    });
  });

  skipBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      await chrome.tabs.sendMessage(tabId, { type: 'SKIP' });
      setStatus('Skipping...');
    });
  });

  stopBtn.addEventListener('click', () => {
    withActiveTab(async (tabId) => {
      await chrome.tabs.sendMessage(tabId, { type: 'STOP' });
      setStatus('Stopped');
      setProgress(0, 0);
    });
  });

  // Receive progress events from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'FR_PROGRESS') {
      const { index = 0, total = 0, done = false } = msg.payload || {};
      setProgress(index, total);
      if (done) setStatus('Done');
      
      // Update list active state
      updateActiveChunk(index);
      if (done) {
        isSpeaking = false;
        toggleControls(false);
      }
    }
    
    if (msg?.type === 'FR_CHUNKS') {
        renderChunks(msg.payload);
        if (msg.payload && msg.payload.length > 0) {
          isSpeaking = true;
          toggleControls(true);
        }
    }
    
    if (msg?.type === 'FR_ERROR') {
      const { error, message, index } = msg.payload || {};
      setStatus(`Speech error (${error || 'unknown'}) at #${(index ?? 0) + 1}`);
    }
    
    if (msg?.type === 'FR_CHAT_ELEMENT') {
      const txt = (msg.payload && msg.payload.text) ? String(msg.payload.text) : '';
      setActiveTab('chat');
      chatInput.value = ('Explain this element: ' + txt.slice(0, 800)).trim();
      chatInput.focus();
      renderChat();
    }
  });
  
  function toggleControls(disable) {
    [readBtn, pickBtn, explainBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = !!disable;
      btn.style.opacity = disable ? '0.6' : '1';
      btn.style.cursor = disable ? 'not-allowed' : 'pointer';
    });
  }
  
  function renderChat() {
    chatMessagesEl.innerHTML = '';
    chatMessages.forEach(m => {
      const div = document.createElement('div');
      div.className = 'chat-msg ' + (m.role === 'user' ? 'user' : 'assistant');
      div.textContent = m.content;
      chatMessagesEl.appendChild(div);
    });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  
  async function sendChat() {
    const text = (chatInput.value || '').trim();
    if (!text) return;
    chatInput.value = '';
    chatMessages.push({ role: 'user', content: text });
    renderChat();
    setStatus('Thinking...');
    try {
      const detail = parseInt(chatDetail.value || '3', 10);
      const hint = detail <= 2 ? 'Short answer in 2 sentences.' : detail >= 5 ? 'Detailed answer in 6-8 sentences.' : 'Medium answer in 3-4 sentences.';
      const convo = chatMessages.slice(-6).map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content).join('\n');
      const prompt = 'You are a helpful assistant. ' + hint + '\n' + convo + '\nAssistant:';
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt), { signal: controller.signal, cache: 'no-store' });
      clearTimeout(t);
      const reply = (await res.text()).trim();
      chatMessages.push({ role: 'assistant', content: reply || '...' });
      renderChat();
      setStatus('Ready to read');
    } catch (e) {
      chatMessages.push({ role: 'assistant', content: 'Error: could not get response.' });
      renderChat();
      setStatus('Ready to read');
    }
  }
  
  chatSendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  function resizeChatInput() {
    try {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
    } catch (_) {}
  }
  resizeChatInput();
  chatInput.addEventListener('input', resizeChatInput);
  
  // --- Chunk List Logic ---
  const chunksList = document.getElementById('chunksList');
  let chunksData = [];

  function renderChunks(chunks) {
      chunksData = chunks;
      chunksList.innerHTML = '';
      
      if (!chunks || chunks.length === 0) {
          chunksList.innerHTML = '<div class="empty-state">No text loaded yet.</div>';
          return;
      }

      chunks.forEach(chunk => {
          const div = document.createElement('div');
          div.className = 'chunk-item';
          div.dataset.index = chunk.index;
          
          if (chunk.type === 'explain') {
              div.classList.add('chunk-explain');
              div.textContent = '🧠 ' + chunk.text;
          } else if (chunk.type === 'friendly') {
              div.classList.add('chunk-friendly');
              div.textContent = '😊 ' + chunk.text;
          } else {
              div.textContent = chunk.text;
          }
          
          div.addEventListener('click', () => {
              const idx = parseInt(div.dataset.index, 10);
              jumpToChunk(idx);
          });
          
          chunksList.appendChild(div);
      });
  }

  function updateActiveChunk(index) {
      const items = chunksList.querySelectorAll('.chunk-item');
      items.forEach(item => {
          item.classList.remove('active');
          if (parseInt(item.dataset.index, 10) === index) {
              item.classList.add('active');
              item.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
      });
  }

  function jumpToChunk(index) {
      withActiveTab(async (tabId) => {
          await chrome.tabs.sendMessage(tabId, { 
              type: 'JUMP_TO_INDEX', 
              index: index 
          });
          setStatus('Jumped to #' + (index + 1));
      });
  }
});
