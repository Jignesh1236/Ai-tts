(() => {
  // Global speech state
  const state = {
    isSpeaking: false,
    isPaused: false,
    queue: [],
    index: 0,
    currentUtterance: null,
    currentMark: null, // For precise highlighting
    options: {
      rate: 1.0,
      pitch: 1.0,
      explainConcepts: true,
      friendlyMode: true,
      readCodeBlocks: false,
      voiceName: ''
    }
  };

  const CONCEPT_MAP = {
    function: "Function ek reusable block hota hai jo inputs leta hai aur output de sakta hai.",
    array: "Array ek list ki tarah hota hai jisme multiple values ek saath store hoti hain.",
    loop: "Loop ek repeat karne wala process hai jo same kaam multiple baar karta hai.",
    variable: "Variable ek naam wala container hota hai jisme values store hoti hain.",
    promise: "Promise future me aane wale value ko represent karta hai, async kaam ke liye use hota hai.",
    object: "Object properties aur values ka collection hota hai.",
    class: "Class ek blueprint hota hai objects create karne ke liye.",
    boolean: "Boolean sirf true ya false ho sakta hai.",
    string: "String text ko represent karta hai.",
    api: "API do softwares ke beech baat karne ka tarika hai.",
    dom: "DOM webpage ka structure hota hai jo JavaScript se modify kiya ja sakta hai.",
    html: "HTML webpage ka skeleton ya structure banata hai.",
    css: "CSS webpage ko style aur design deta hai.",
    json: "JSON data interchange format hai jo readable hota hai.",
    ajax: "AJAX bina page reload kiye server se data laata hai.",
    callback: "Callback ek function hai jo kisi aur function ke baad run hota hai.",
    recursion: "Recursion jab function khud ko call karta hai.",
    scope: "Scope define karta hai ki variables kahan access kiye ja sakte hain.",
    closure: "Closure ek function hai jo apne lexical scope ko yaad rakhta hai.",
    event: "Event user action ya browser trigger hota hai jaise click ya load.",
    component: "Component UI ka ek reusable hissa hota hai.",
    state: "State component ka data hota hai jo change ho sakta hai.",
    props: "Props parent se child component me data pass karne ke liye hote hain."
  };

  const FRIENDLY_LINES = [
    "Simple shabdo me: is concept ko aise samjho...",
    "Iska matlab ye hua ki agar aap ye karein to...",
    "Easy way: pehle input samjho, phir output dekho...",
    "Short cut: examples ke through samajhna behtar hota hai...",
    "Ek dost ki tarah: chinta mat karo, step-by-step samjhte hain."
  ];

  function getReadableItems(rootElement) {
    // 1. Identify Root
    let root = rootElement || document.body;
    try {
      const host = location.hostname;
      if (!rootElement && host.includes('freecodecamp.org')) {
        const el = document.querySelector('.lesson-content, .lesson-instructions, .challenge-instructions');
        if (el) root = el;
      }
    } catch (e) {}

    const items = [];
    
    // 2. Walk - Collect text nodes
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Filter out invisible, script, style, etc.
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                
                const tag = parent.tagName.toLowerCase();
                if (['script', 'style', 'noscript', 'iframe', 'svg', 'path', 'code', 'pre', 'button', 'input', 'textarea', 'select', 'kbd', 'samp'].includes(tag)) return NodeFilter.FILTER_REJECT;
                if (parent.closest('nav, footer, header, aside, .ad, .ads, [role="navigation"]')) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.monaco-editor, .code-block, .code, .hljs, .cm-editor, .CodeMirror, [role="code"], [class*="code"], [class*="syntax"], pre, code')) return NodeFilter.FILTER_REJECT;
                
                // Check visibility
                if (parent.offsetParent === null && parent.tagName !== 'BODY') return NodeFilter.FILTER_REJECT;
                
                // Check if empty
                if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    let node;
    while(node = walker.nextNode()) {
        items.push({
            text: node.textContent.trim(), // We use trim for logic but might need original for offset?
            // Actually, we should use original textContent for offset calculations, but we only want to read trimmed content.
            // Let's store trimmed text for reading, and we will find it in the original node.
            fullText: node.textContent, 
            node: node,
            element: node.parentElement
        });
    }
    
    return items;
  }

  // --- Highlight Logic ---
  let highlightStyle = null;
  function ensureHighlightStyle() {
    if (!highlightStyle) {
      highlightStyle = document.createElement('style');
      highlightStyle.textContent = `
        mark.fr-reading-active {
          background-color: rgba(255, 235, 59, 0.6) !important;
          color: inherit !important;
          border-radius: 4px;
          box-shadow: 0 0 5px rgba(255, 193, 7, 0.5);
          padding: 2px 0;
        }
        .fr-reading-highlight { /* Legacy support */
          background-color: yellow !important;
        }
        .fr-reading-active-fallback {
          outline: 3px solid #f59e0b !important;
          background-color: rgba(255, 235, 59, 0.08) !important;
        }
      `;
      document.head.appendChild(highlightStyle);
    }
  }

  function highlightRange(node, start, end) {
    if (!node || !node.isConnected) return;
    ensureHighlightStyle();
    clearHighlight();

    try {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        
        const mark = document.createElement('mark');
        mark.className = 'fr-reading-active';
        
        // surroundContents can fail if range partially selects non-text nodes, 
        // but here we are strictly inside a single Text Node.
        range.surroundContents(mark);
        
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        state.currentMark = mark;
    } catch (e) {
        console.warn('Highlight failed', e);
        // Fallback: highlight parent element
        if (node.parentElement) {
            node.parentElement.classList.add('fr-reading-active-fallback');
            // We would need style for this too, but let's assume mark works for text nodes.
        }
    }
  }

  function clearHighlight() {
     if (state.currentMark) {
         const mark = state.currentMark;
         const parent = mark.parentNode;
         if (parent) {
             // Unwrap
             while (mark.firstChild) {
                 parent.insertBefore(mark.firstChild, mark);
             }
             parent.removeChild(mark);
             parent.normalize(); // Merge text nodes back
         }
         state.currentMark = null;
     }
  }

  // --- Selection Mode Logic ---
  let selectionModeActive = false;
  let highlightedElement = null;
  let selectionModeType = 'read'; // 'read' | 'explain'

  function handleMouseOver(e) {
    if (!selectionModeActive) return;
    if (highlightedElement) {
      highlightedElement.style.outline = '';
      highlightedElement.style.cursor = '';
    }
    const target = e.target;
    // Skip our own overlay/ui if any
    if (target.tagName === 'BODY' || target.tagName === 'HTML' || target.id === 'fr-selection-indicator') return;
    
    highlightedElement = target;
    target.style.outline = '3px solid #f59e0b'; // Matching the theme
    target.style.cursor = 'pointer';
    target.style.backgroundColor = 'rgba(255, 235, 59, 0.1)';
  }

  function handleMouseOut(e) {
    if (!selectionModeActive) return;
    if (e.target) {
      e.target.style.outline = '';
      e.target.style.cursor = '';
      e.target.style.backgroundColor = '';
    }
  }

  function handleClick(e) {
    if (!selectionModeActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    
    // Stop selection mode
    stopSelectionMode();

    if (target) {
      // Use stored options or default
      const opts = state.pendingOptions || {
        rate: 1.0,
        pitch: 1.0,
        explainConcepts: false,
        friendlyMode: true,
        readCodeBlocks: false
      };
      if (selectionModeType === 'explain') {
        ensureHighlightStyle();
        try { target.classList.add('fr-reading-active-fallback'); } catch(_) {}
        const elementText = (target.innerText || '').trim();
        const prompt = 'Hindi me simple shabdon me 2 lines me explain karo aur ek chhota example do: ' + elementText.slice(0, 800);
        const queue = [{ type: 'explain', text: '', source: 'pollinations', prompt, element: target }];
        speakQueue(queue, opts);
      } else if (selectionModeType === 'chat') {
        ensureHighlightStyle();
        try { target.classList.add('fr-reading-active-fallback'); } catch(_) {}
        const elementText = (target.innerText || '').trim();
        try {
          chrome.runtime.sendMessage({ type: 'FR_CHAT_ELEMENT', payload: { text: elementText.slice(0, 1200) } });
        } catch (_) {}
        setTimeout(() => {
          try { target.classList.remove('fr-reading-active-fallback'); } catch(_) {}
        }, 1200);
      } else {
        const items = getReadableItems(target);
        if (items.length > 0) {
          const queue = buildQueueFromItems(items, opts);
          speakQueue(queue, opts);
        } else {
          alert('No text found in this element.');
        }
      }
    }
  }

  function startSelectionMode(options, mode = 'read') {
    if (selectionModeActive) return;
    selectionModeActive = true;
    selectionModeType = mode === 'explain' ? 'explain' : 'read';
    state.pendingOptions = {
        rate: options?.slowMode ? 0.9 : 1.0,
        pitch: 1.0,
        explainConcepts: false,
        friendlyMode: !!options?.friendlyMode,
        readCodeBlocks: !!options?.readCodeBlocks,
        voiceName: options?.voiceName
    };
    
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    
    // Add a visual indicator
    const div = document.createElement('div');
    div.id = 'fr-selection-indicator';
    div.style.position = 'fixed';
    div.style.top = '20px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.background = '#1e293b';
    div.style.color = '#fff';
    div.style.padding = '10px 20px';
    div.style.borderRadius = '50px';
    div.style.zIndex = '999999';
    div.style.fontFamily = 'system-ui, sans-serif';
    div.style.fontWeight = '600';
    div.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '10px';
    const actionLabel = selectionModeType === 'explain' ? 'explain' : (selectionModeType === 'chat' ? 'ask in chat' : 'read');
    div.innerHTML = '<span>👆 Click any text to ' + actionLabel + '</span><span style="font-size: 12px; opacity: 0.7">(ESC to cancel)</span><button id="fr-selection-close" style="margin-left:8px;background:#ef4444;border:none;color:#fff;border-radius:16px;padding:4px 8px;cursor:pointer;">✖</button>';
    
    // Cancel on ESC
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            stopSelectionMode();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    document.body.appendChild(div);
    const closeBtn = document.getElementById('fr-selection-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopSelectionMode();
        document.removeEventListener('keydown', escHandler);
      }, { once: true });
    }
  }

  function stopSelectionMode() {
    selectionModeActive = false;
    if (highlightedElement) {
      highlightedElement.style.outline = '';
      highlightedElement.style.cursor = '';
      highlightedElement.style.backgroundColor = '';
      highlightedElement = null;
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    
    const div = document.getElementById('fr-selection-indicator');
    if (div) div.remove();
  }


  function splitIntoChunks(text, maxLen = 250) {
    if (!text) return [];
    // Split by sentence boundaries roughly
    const parts = text.split(/(?<=[.!?])\s+/g);
    const chunks = [];
    let buffer = '';
    
    for (const part of parts) {
      if ((buffer + ' ' + part).trim().length <= maxLen) {
        buffer = (buffer ? buffer + ' ' : '') + part;
      } else {
        if (buffer) chunks.push(buffer.trim());
        if (part.length <= maxLen) {
          buffer = part;
        } else {
          // Hard split long sentences
          for (let i = 0; i < part.length; i += maxLen) {
            chunks.push(part.slice(i, i + maxLen));
          }
          buffer = '';
        }
      }
    }
    if (buffer) chunks.push(buffer.trim());
    return chunks;
  }

  function sentenceOffsets(text) {
    if (!text) return [];
    const result = [];
    const re = /[^.!?]+[.!?]+|\S+$/g;
    let m;
    while (m = re.exec(text)) {
      const raw = m[0];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const start = m.index + raw.indexOf(trimmed);
      const end = start + trimmed.length;
      result.push({ text: trimmed, start, end });
    }
    return result;
  }

  function buildQueueFromItems(items, opts) {
    const queue = [];
    let friendlyCounter = 0;
    for (const item of items) {
      const segments = sentenceOffsets(item.fullText);
      for (const seg of segments) {
          const chunk = seg.text;
          const start = seg.start;
          const end = seg.end;
          if (opts.friendlyMode) {
            friendlyCounter++;
            if (friendlyCounter % 6 === 0) {
              const line = FRIENDLY_LINES[Math.floor(Math.random() * FRIENDLY_LINES.length)];
              queue.push({ type: 'friendly', text: line });
            }
          }
          queue.push({ 
              type: 'content', 
              text: chunk, 
              node: item.node,
              start: start,
              end: end
          });
      }
    }
    return queue;
  }

  function speakNext() {
    if (!state.isSpeaking) return;
    if (state.index >= state.queue.length) {
      state.isSpeaking = false;
      state.isPaused = false;
      state.currentUtterance = null;
      sendProgress({ done: true, total: state.queue.length, index: state.queue.length });
      return;
    }
    
    const item = state.queue[state.index];
    const u = new SpeechSynthesisUtterance(item.text);
    state.currentUtterance = u;
    
    // Highlight the text being read
    if (item.type === 'content' && item.node) {
        highlightRange(item.node, item.start, item.end);
    } else {
        // For explanations, we might want to keep the previous highlight or clear it.
        // Keeping it is usually better context.
    }
    
    if (item.type === 'explain') {
      u.rate = Math.max(0.85, Math.min(2, state.options.rate - 0.1));
      u.pitch = Math.max(0.5, Math.min(2, state.options.pitch + 0.1));
      u.lang = 'hi-IN';
    } else if (item.type === 'friendly') {
      u.rate = Math.max(0.9, Math.min(2, state.options.rate));
      u.pitch = Math.max(0.5, Math.min(2, state.options.pitch));
      u.lang = 'hi-IN';
    } else {
      u.rate = Math.max(0.8, Math.min(2, state.options.rate));
      u.pitch = Math.max(0.5, Math.min(2, state.options.pitch));
      u.lang = document.documentElement.lang || 'en-US';
    }

    u.onend = () => {
      // If we are still speaking (not cancelled or stopped)
      if (state.isSpeaking) {
          clearHighlight(); // Clear when done
          const prev = state.queue[state.index];
          if (prev && prev.type === 'explain' && prev.element) {
            try { prev.element.classList.remove('fr-reading-active-fallback'); } catch(_) {}
          }
          state.index += 1;
          sendProgress({ done: false, total: state.queue.length, index: state.index });
          speakNext();
      }
    };
    
    u.onerror = (e) => {
      try {
        chrome.runtime.sendMessage({ type: 'FR_ERROR', payload: { error: (e && e.error) || 'unknown', message: (e && e.message) || '', index: state.index } });
      } catch(_) {}
      clearHighlight();
      if (state.isSpeaking) {
        if (!item._fallbackTried) {
          item._fallbackTried = true;
          try { speechSynthesis.cancel(); } catch(_) {}
          const alt = new SpeechSynthesisUtterance(String(item.text || '').slice(0, 180));
          // Force default voice and sane params
          alt.rate = 1.0;
          alt.pitch = 1.0;
          alt.lang = (item.type === 'explain' || item.type === 'friendly') ? 'hi-IN' : 'en-US';
          alt.onend = () => {
            if (state.isSpeaking) {
              clearHighlight();
              state.index += 1;
              sendProgress({ done: false, total: state.queue.length, index: state.index });
              speakNext();
            }
          };
          alt.onerror = () => {
            clearHighlight();
            if (state.isSpeaking) {
              state.index += 1;
              speakNext();
            }
          };
          state.currentUtterance = alt;
          try { speechSynthesis.speak(alt); } catch(_) {
            state.index += 1;
            speakNext();
          }
          return;
        }
        state.index += 1;
        speakNext();
      }
    };
    
    // Voice selection logic
    const voices = speechSynthesis.getVoices();
    let selectedVoice = null;
    
    // Prefer user-selected voice always
    if (state.options.voiceName) {
      selectedVoice = voices.find(v => v.name === state.options.voiceName) || null;
    }
    // If user didn't choose, pick Hindi for explain/friendly
    if (!selectedVoice && (item.type === 'explain' || item.type === 'friendly')) {
      selectedVoice = voices.find(v => /Google.*Hindi|Hindi/i.test(v.name) || (v.lang && v.lang.toLowerCase().startsWith('hi'))) || null;
    }
    // Otherwise fallback to English
    if (!selectedVoice) {
      selectedVoice = voices.find(v => /Google US English|Samantha|female/i.test(v.name) || (v.lang && v.lang.toLowerCase().startsWith('en'))) || null;
    }
    
    if (selectedVoice) u.voice = selectedVoice;
    else {
      // If no voice found, set language hint
      u.lang = (item.type === 'explain' || item.type === 'friendly') ? 'hi-IN' : (document.documentElement.lang || 'en-US');
    }

    speechSynthesis.speak(u);
  }

  async function fetchPollinationsText(prompt) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt), { signal: controller.signal, cache: 'no-store' });
      clearTimeout(t);
      const txt = await res.text();
      return (txt || '').trim();
    } catch (e) {
      return '';
    }
  }

  function makePollinationsPrompt(chunk) {
    return 'Kripya Hindi me, simple shabdo me, is text ka explanation do aur ek chhota example bhi: ' + chunk;
  }

  async function populateExplanations(queue) {
    const tasks = [];
    for (const item of queue) {
      if (item.type === 'explain' && item.source === 'pollinations' && !item.text) {
        tasks.push((async () => {
          const text = await fetchPollinationsText(item.prompt);
          item.text = text || 'Is concept ko simple shabdo me samjho: ' + item.prompt;
        })());
      }
    }
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  async function speakQueue(queue, opts, startIndex = 0) {
    cancelSpeech(false);
    state.queue = queue;
    state.index = startIndex;
    state.options = opts;
    state.isSpeaking = true;
    state.isPaused = false;
    await populateExplanations(queue);
    const chunks = queue.map((q, i) => ({ 
        index: i, 
        text: q.text, 
        type: q.type 
    }));
    try {
        chrome.runtime.sendMessage({ type: 'FR_CHUNKS', payload: chunks });
    } catch(e) {}
    speakNext();
  }

  function pauseSpeech() {
    if (state.isSpeaking && !state.isPaused) {
      speechSynthesis.pause();
      state.isPaused = true;
    }
  }

  function resumeSpeech() {
    if (state.isSpeaking && state.isPaused) {
      speechSynthesis.resume();
      state.isPaused = false;
    }
  }

  function cancelSpeech(clearQueue = true) {
    try { speechSynthesis.cancel(); } catch (e) {}
    clearHighlight();
    state.isSpeaking = false;
    state.isPaused = false;
    if (clearQueue) {
        state.queue = [];
        state.index = 0;
        sendProgress({ done: true, total: 0, index: 0 });
    }
  }

  function jumpTo(index) {
     if (index >= 0 && index < state.queue.length) {
         // Stop current speech
         try { speechSynthesis.cancel(); } catch(e) {}
         // Update index
         state.index = index;
         state.isSpeaking = true;
         state.isPaused = false;
         sendProgress({ done: false, total: state.queue.length, index: state.index });
         speakNext();
     }
  }

  function sendProgress(payload) {
    try {
      chrome.runtime.sendMessage({ type: 'FR_PROGRESS', payload });
    } catch (e) { }
  }

  // Listen for popup commands
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'READ_PAGE': {
        // 1. Check for user selection first (manual selection by user)
        let items = [];
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText) {
             // If user manually selected text, we want to read THAT.
             // But we need to handle it carefully. 
             // If we can get the range, we can traverse it.
             // For simplicity, let's just use the text.
             // But highlighting won't work perfectly on manual selection if we don't have nodes.
             // Actually, we can use the anchorNode.
             
             if (selection.anchorNode && selection.anchorNode.nodeType === Node.TEXT_NODE) {
                  // Single node selection?
                  items.push({ 
                      text: selectedText, 
                      fullText: selection.anchorNode.textContent,
                      node: selection.anchorNode,
                      element: selection.anchorNode.parentElement 
                  });
             } else {
                 // Complex selection. Fallback to reading text without highlight?
                 // Or try to parse selection ranges.
                 // Let's fallback to getReadableItems() but filtered by selection? 
                 // Too complex for now.
                 // Fallback: just read the text, no highlight.
                 items.push({ text: selectedText, element: null }); 
             }
        } else {
             // Full page read
             items = getReadableItems();
        }

        if (items.length === 0) {
          sendResponse({ ok: false, error: 'No readable text found.' });
          return;
        }
        
        const opts = {
          rate: msg.options?.slowMode ? 0.9 : 1.0,
          pitch: 1.0,
          explainConcepts: !!msg.options?.explainConcepts,
          friendlyMode: !!msg.options?.friendlyMode,
          readCodeBlocks: false,
          voiceName: msg.options?.voiceName
        };

        const queue = buildQueueFromItems(items, opts);
        speakQueue(queue, opts);
        
        sendResponse({ ok: true, total: queue.length });
        break;
      }
      case 'PAUSE': {
        pauseSpeech();
        sendResponse({ ok: true });
        break;
      }
      case 'RESUME': {
        resumeSpeech();
        sendResponse({ ok: true });
        break;
      }
      case 'STOP': {
        cancelSpeech();
        sendResponse({ ok: true });
        break;
      }
      case 'SKIP': {
        if (state.skip) state.skip();
        sendResponse({ ok: true });
        break;
      }
      case 'PING': {
        sendResponse({ ok: true, pong: true });
        break;
      }
      case 'START_SELECTION': {
        startSelectionMode(msg.options, 'read');
        sendResponse({ ok: true });
        break;
      }
      case 'START_SELECTION_EXPLAIN': {
        startSelectionMode(msg.options, 'explain');
        sendResponse({ ok: true });
        break;
      }
      case 'START_SELECTION_CHAT': {
        startSelectionMode(msg.options, 'chat');
        sendResponse({ ok: true });
        break;
      }
      case 'CANCEL_SELECTION': {
        stopSelectionMode();
        sendResponse({ ok: true });
        break;
      }
      case 'JUMP_TO_INDEX': {
        jumpTo(msg.index);
        sendResponse({ ok: true });
        break;
      }
      default:
        break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelSpeech();
  });
  window.addEventListener('pagehide', () => cancelSpeech());

})();
