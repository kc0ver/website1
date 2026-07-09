(function () {
  'use strict';

  const STORAGE_KEY = 'ai-debate-arena-browser-config-v1';
  const COLORS = ['#000080', '#008080', '#800000', '#808000', '#800080', '#000000'];
  const DEFAULTS = {
    openrouter: 'https://openrouter.ai/api/v1',
    '    openai-compatible': 'https://api.openai.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    anthropic: 'https://api.anthropic.com/v1',
    deepseek: 'https://api.deepseek.com',
    manual: '',
  };
  const PROVIDER_LABELS = {
    openrouter: 'OpenRouter',
    'openai-compatible': 'OpenAI 兼容',
    google: 'Google Gemini',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    manual: '自定义',
  };
  const PROVIDER_DEFAULTS = {
    deepseek: { model: 'deepseek-v4-flash', contextWindow: 1048576, maxOutputTokens: 384000 },
  };

  const MODEL_PRESETS = {
    'openai/gpt-4o': { contextWindow: 128000, maxOutputTokens: 16384, supportsVision: true, supportsThinking: false },
    'gpt-4o': { contextWindow: 128000, maxOutputTokens: 16384, supportsVision: true, supportsThinking: false },
    'gpt-4.1': { contextWindow: 1047576, maxOutputTokens: 32768, supportsVision: true, supportsThinking: false },
    'o3': { contextWindow: 200000, maxOutputTokens: 100000, supportsVision: true, supportsThinking: true },
    'anthropic/claude-3.5-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, supportsVision: true, supportsThinking: false },
    'claude-sonnet-4-20250514': { contextWindow: 200000, maxOutputTokens: 64000, supportsVision: true, supportsThinking: true },
    'google/gemini-2.5-pro': { contextWindow: 1048576, maxOutputTokens: 65536, supportsVision: true, supportsThinking: true },
    'gemini-2.5-pro': { contextWindow: 1048576, maxOutputTokens: 65536, supportsVision: true, supportsThinking: true },
    'deepseek/deepseek-chat': { contextWindow: 64000, maxOutputTokens: 8192, supportsVision: false, supportsThinking: false },
    'deepseek-v4-flash': { contextWindow: 1048576, maxOutputTokens: 384000, supportsVision: false, supportsThinking: false },
  };

  const $ = id => document.getElementById(id);
  const dom = {
    panel: $('panel'), status: $('status'), topic: $('topic'), rounds: $('rounds'), verbosity: $('verbosity'),
    globalInstructions: $('globalInstructions'), participants: $('participants'), messages: $('messages'),
    startBtn: $('startBtn'), stopBtn: $('stopBtn'), clearBtn: $('clearBtn'), userInput: $('userInput'),
    composer: $('composer'), fileInput: $('fileInput'), pickFiles: $('pickFiles'), filePreview: $('filePreview'),
    dialog: $('participantDialog'), bulkDialog: $('bulkDialog'), discoverParticipant: $('discoverParticipant'), modelResults: $('modelResults'),
  };

  const state = loadConfig() || defaultState();
  let abortController = null;
  let currentAssistant = null;
  let editingJudge = false;
  let activeOrder = [];

  function defaultState() {
    return {
      mode: 'debate', active: false, currentRound: 0, pendingFiles: [], messages: [],
      topic: '人工智能是否会取代人类的大部分工作？', rounds: 3,
      settings: { verbosity: 'long', globalInstructions: '' },
      judgeEnabled: false,
      judge: participant({ name: 'Judge', provider: 'openrouter', model: 'openai/gpt-4o', systemPrompt: '你是一位中立、严谨的辩论裁判。请评估双方论证质量、证据强度、逻辑漏洞和最终胜负。', color: '#800000' }),
      participants: [
        participant({ name: 'Alpha', provider: 'openrouter', model: 'openai/gpt-4o', stance: '正方 - AI 会取代大部分工作', systemPrompt: '你是一位逻辑清晰、重视证据的辩论者。', color: COLORS[0] }),
        participant({ name: 'Beta', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', stance: '反方 - AI 不会取代大部分工作', systemPrompt: '你是一位关注社会影响和人类价值的辩论者。', color: COLORS[1] }),
      ],
    };
  }

  function participant(overrides) {
    const provider = overrides.provider || 'openrouter';
    const preset = MODEL_PRESETS[overrides.model] || {};
    return Object.assign({
      id: uid(), name: 'AI', provider, model: '', apiKey: '', baseURL: DEFAULTS[provider] || '', stance: '',
      systemPrompt: '', color: COLORS[0], contextWindow: preset.contextWindow || '',
      maxTokens: preset.maxOutputTokens || 2048, temperature: 0.8, supportsVision: !!preset.supportsVision,
    }, overrides);
  }

  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function esc(value) { const el = document.createElement('div'); el.textContent = value == null ? '' : String(value); return el.innerHTML; }
  function clampNumber(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }

  function renderMarkdown(markdown) {
    const src = String(markdown || '').replace(/\r\n/g, '\n');
    const codeBlocks = [];
    let text = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@CODEBLOCK${codeBlocks.length}@@`;
      codeBlocks.push(`<pre><code class="language-${esc(lang || 'text')}">${esc(code.replace(/\n$/, ''))}</code></pre>`);
      return token;
    });

    text = esc(text);
    text = text.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    text = renderLists(text);
    text = text.replace(/@@CODEBLOCK(\d+)@@/g, (_, i) => codeBlocks[Number(i)] || '');
    return text.split(/\n{2,}/).map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h\d|ul|ol|blockquote|pre)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function renderLists(html) {
    const lines = html.split('\n');
    const out = [];
    let listType = null;
    const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
    for (const line of lines) {
      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
      if (unordered || ordered) {
        const type = unordered ? 'ul' : 'ol';
        if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
        out.push(`<li>${unordered ? unordered[1] : ordered[1]}</li>`);
      } else {
        closeList();
        out.push(line);
      }
    }
    closeList();
    return out.join('\n');
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      parsed.pendingFiles = [];
      parsed.messages = [];
      parsed.active = false;
      parsed.participants = (parsed.participants || []).map(p => participant(p));
      parsed.judge = participant(parsed.judge || { name: 'Judge', provider: 'openrouter', model: 'openai/gpt-4o', systemPrompt: '你是一位中立、严谨的辩论裁判。请评估双方论证质量、证据强度、逻辑漏洞和最终胜负。', color: '#800000' });
      parsed.judgeEnabled = !!parsed.judgeEnabled;
      return parsed;
    } catch (err) {
      console.warn('配置读取失败', err);
      return null;
    }
  }

  let saveTimer = null;

  function saveConfig() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const copy = {
        mode: state.mode,
        topic: state.topic,
        rounds: state.rounds,
        settings: state.settings,
        judgeEnabled: state.judgeEnabled,
        judge: state.judge,
        active: false,
        currentRound: 0,
        pendingFiles: [],
        messages: [],
        participants: state.participants,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    }, 250);
  }

  function syncInputs() {
    dom.topic.value = state.topic;
    dom.rounds.value = state.rounds;
    dom.verbosity.value = state.settings.verbosity;
    dom.globalInstructions.value = state.settings.globalInstructions;
    document.querySelectorAll('.mode-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.mode));
    document.querySelectorAll('.debate-only').forEach(el => el.style.display = state.mode === 'debate' ? '' : 'none');
    document.querySelectorAll('.rounds-enabled').forEach(el => el.style.display = state.mode === 'discussion' ? 'none' : '');
    $('topicTitle').textContent = state.mode === 'debate' ? '辩论设置' : state.mode === 'cooperation' ? '合作设置' : '讨论设置';
    $('topicLabel').textContent = state.mode === 'debate' ? '辩论主题' : state.mode === 'cooperation' ? '合作目标' : '讨论话题';
    $('participantsTitle').textContent = state.mode === 'debate' ? '参与者' : state.mode === 'cooperation' ? '合作成员' : '讨论同伴';
    dom.startBtn.textContent = state.mode === 'debate' ? '开始辩论' : state.mode === 'cooperation' ? '开始合作' : '开始讨论';
    renderParticipants();
    renderJudge();
    renderDiscoverOptions();
    setActive(false);
  }

  function renderParticipants() {
    dom.participants.innerHTML = '';
    state.participants.forEach((p, index) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'participant';
      const ctx = p.contextWindow ? `${Number(p.contextWindow).toLocaleString()} 上下文` : '未知上下文';
      el.innerHTML = `<span class="dot" style="background:${esc(p.color)}"></span><span><strong>${esc(p.name)}</strong><span class="meta">${esc(PROVIDER_LABELS[p.provider] || p.provider)} / ${esc(p.model || '未配置模型')}</span><span class="caps"><span>${ctx}</span>${p.supportsVision ? '<span>图片</span>' : ''}<span>流式</span></span></span>`;
      el.addEventListener('click', () => openParticipant(index));
      dom.participants.appendChild(el);
    });
  }

  function renderDiscoverOptions() {
    dom.discoverParticipant.innerHTML = state.participants.map((p, i) => `<option value="${i}">${esc(p.name)} · ${esc(p.model || p.provider)}</option>`).join('');
  }

  function renderJudge() {
    $('judgeEnabled').checked = !!state.judgeEnabled;
    const p = state.judge;
    const ctx = p.contextWindow ? `${Number(p.contextWindow).toLocaleString()} 上下文` : '未知上下文';
    $('judgeSummary').innerHTML = `<button class="participant" type="button" id="judgeCard"><span class="dot" style="background:${esc(p.color)}"></span><span><strong>${esc(p.name)}</strong><span class="meta">${esc(PROVIDER_LABELS[p.provider] || p.provider)} / ${esc(p.model || '未配置模型')}</span><span class="caps"><span>${ctx}</span>${p.supportsVision ? '<span>图片</span>' : ''}<span>仅总结</span></span></span></button>`;
    $('judgeCard').addEventListener('click', openJudge);
  }

  function setActive(active) {
    state.active = active;
    dom.status.textContent = active ? (state.mode === 'debate' ? '辩论中' : state.mode === 'cooperation' ? '合作中' : '讨论中') : '空闲';
    dom.status.classList.toggle('active', active);
    dom.startBtn.disabled = active;
    dom.stopBtn.disabled = !active;
  }

  function addDivider(text) {
    removeWelcome();
    const el = document.createElement('div');
    el.className = 'divider';
    el.textContent = text;
    dom.messages.appendChild(el);
    scrollBottom();
  }

  function addMessage(message) {
    removeWelcome();
    const el = document.createElement('div');
    el.className = `message ${message.role === 'user' ? 'user' : ''}`;
    const avatar = `<div class="avatar" style="background:${esc(message.color || '#000080')}">${esc((message.speakerName || '?').charAt(0).toUpperCase())}</div>`;
    const fileList = message.files && message.files.length ? `\n\n${message.files.map(f => `[附件: ${f.name}]`).join('\n')}` : '';
    const bubble = `<div><div class="msg-head"><strong>${esc(message.speakerName)}</strong><span>${new Date(message.createdAt).toLocaleTimeString()}</span></div><div class="bubble markdown-body ${message.error ? 'error' : ''}"></div></div>`;
    el.innerHTML = message.role === 'user' ? bubble + avatar : avatar + bubble;
    dom.messages.appendChild(el);
    const bubbleEl = el.querySelector('.bubble');
    bubbleEl.dataset.raw = `${message.content || ''}${fileList}`;
    bubbleEl.innerHTML = renderMarkdown(bubbleEl.dataset.raw);
    scrollBottom();
    return bubbleEl;
  }

  let renderQueue = new Set();
  let renderScheduled = false;

  function flushRenderQueue() {
    renderScheduled = false;
    for (const bubble of renderQueue) {
      bubble.innerHTML = renderMarkdown(bubble.dataset.raw || '');
    }
    renderQueue.clear();
    scrollBottom();
  }

  function appendToBubble(bubble, text) {
    bubble.dataset.raw = (bubble.dataset.raw || '') + text;
    renderQueue.add(bubble);
    if (!renderScheduled) {
      renderScheduled = true;
      requestAnimationFrame(flushRenderQueue);
    }
  }

  function forceRender(bubble) {
    bubble.innerHTML = renderMarkdown(bubble.dataset.raw || '');
    scrollBottom();
  }

  function removeWelcome() { const w = dom.messages.querySelector('.welcome'); if (w) w.remove(); }
  function scrollBottom() { dom.messages.scrollTop = dom.messages.scrollHeight; }

  function openParticipant(index) {
    editingJudge = false;
    const p = index >= 0 ? state.participants[index] : participant({ name: `AI ${state.participants.length + 1}`, color: COLORS[state.participants.length % COLORS.length] });
    $('dialogTitle').textContent = index >= 0 ? `编辑 ${p.name}` : '添加参与者';
    $('editIndex').value = index;
    $('pName').value = p.name || '';
    $('pColor').value = p.color || COLORS[0];
    $('pProvider').value = p.provider || 'openrouter';
    $('pModel').value = p.model || '';
    $('pBaseURL').value = p.baseURL || DEFAULTS[p.provider] || '';
    $('pApiKey').value = p.apiKey || '';
    $('pContext').value = p.contextWindow || '';
    $('pMaxTokens').value = p.maxTokens || 2048;
    $('pTemperature').value = p.temperature ?? 0.8;
    $('pVision').checked = !!p.supportsVision;
    $('pStance').value = p.stance || '';
    $('pPrompt').value = p.systemPrompt || '';
    $('deleteParticipant').style.display = index >= 0 && state.participants.length > (state.mode === 'debate' ? 2 : 1) ? '' : 'none';
    $('stanceWrap').style.display = state.mode === 'debate' ? '' : 'none';
    dom.dialog.showModal();
  }

  function openJudge() {
    editingJudge = true;
    const p = state.judge;
    $('dialogTitle').textContent = '编辑裁判';
    $('editIndex').value = -1;
    $('pName').value = p.name || 'Judge';
    $('pColor').value = p.color || '#800000';
    $('pProvider').value = p.provider || 'openrouter';
    $('pModel').value = p.model || '';
    $('pBaseURL').value = p.baseURL || DEFAULTS[p.provider] || '';
    $('pApiKey').value = p.apiKey || '';
    $('pContext').value = p.contextWindow || '';
    $('pMaxTokens').value = p.maxTokens || 2048;
    $('pTemperature').value = p.temperature ?? 0.4;
    $('pVision').checked = !!p.supportsVision;
    $('pStance').value = '';
    $('pPrompt').value = p.systemPrompt || '';
    $('deleteParticipant').style.display = 'none';
    $('stanceWrap').style.display = 'none';
    dom.dialog.showModal();
  }

  function saveParticipantFromDialog() {
    const index = Number($('editIndex').value);
    const provider = $('pProvider').value;
    const model = $('pModel').value.trim();
    if (!model) return alert('请输入模型名称');
    const p = participant({
      id: index >= 0 ? state.participants[index].id : uid(), name: $('pName').value.trim() || `AI ${state.participants.length + 1}`,
      provider, model, apiKey: $('pApiKey').value.trim(), baseURL: $('pBaseURL').value.trim() || DEFAULTS[provider] || '',
      color: $('pColor').value, contextWindow: $('pContext').value ? Number($('pContext').value) : '',
      maxTokens: clampNumber($('pMaxTokens').value, 2048, 128, 1000000), temperature: clampNumber($('pTemperature').value, 0.8, 0, 2),
      supportsVision: $('pVision').checked, stance: $('pStance').value.trim(), systemPrompt: $('pPrompt').value.trim(),
    });
    if (editingJudge) {
      state.judge = Object.assign({}, p, { stance: '' });
      editingJudge = false;
    } else if (index >= 0) state.participants[index] = p; else state.participants.push(p);
    dom.dialog.close();
    renderParticipants();
    renderJudge();
    renderDiscoverOptions();
    saveConfig();
  }

  function openBulkConfig() {
    const first = state.participants[0] || participant({});
    $('bProvider').value = first.provider || 'openrouter';
    $('bBaseURL').value = first.baseURL || DEFAULTS[first.provider] || '';
    $('bApiKey').value = first.apiKey || '';
    $('bModel').value = '';
    $('bContext').value = '';
    $('bMaxTokens').value = '';
    $('bTemperature').value = '';
    $('bVision').checked = state.participants.length ? state.participants.every(p => p.supportsVision) : false;
    dom.bulkDialog.showModal();
  }

  function applyBulkConfig() {
    const provider = $('bProvider').value;
    const baseURL = $('bBaseURL').value.trim() || DEFAULTS[provider] || '';
    const apiKey = $('bApiKey').value.trim();
    const model = $('bModel').value.trim();
    const contextWindow = $('bContext').value.trim();
    const maxTokens = $('bMaxTokens').value.trim();
    const temperature = $('bTemperature').value.trim();
    const supportsVision = $('bVision').checked;
    state.participants = state.participants.map(p => {
      const next = Object.assign({}, p, { provider, baseURL, apiKey, supportsVision });
      if (model) {
        const preset = mergePreset(model, {});
        next.model = model;
        next.contextWindow = preset.contextWindow || next.contextWindow;
        next.maxTokens = preset.maxOutputTokens || next.maxTokens;
        next.supportsVision = supportsVision || preset.supportsVision || false;
      }
      if (contextWindow) next.contextWindow = Number(contextWindow);
      if (maxTokens) next.maxTokens = clampNumber(maxTokens, next.maxTokens || 2048, 128, 1000000);
      if (temperature) next.temperature = clampNumber(temperature, next.temperature ?? 0.8, 0, 2);
      return next;
    });
    dom.bulkDialog.close();
    renderParticipants();
    renderDiscoverOptions();
    saveConfig();
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList || []);
    const maxFiles = 10;
    const maxFileSize = 10 * 1024 * 1024;
    const maxTotal = 20 * 1024 * 1024;
    let total = state.pendingFiles.reduce((sum, f) => sum + f.size, 0);
    for (const file of files) {
      if (state.pendingFiles.length >= maxFiles) { alert('最多上传 10 个附件'); break; }
      if (file.size > maxFileSize) { alert(`${file.name} 超过 10MB`); continue; }
      if (total + file.size > maxTotal) { alert('附件总大小不能超过 20MB'); break; }
      total += file.size;
      const item = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, isImage: file.type.startsWith('image/') };
      if (item.isImage) item.data = await readAsDataUrl(file).then(url => url.split(',')[1] || '');
      else item.text = (await file.text()).slice(0, 50000);
      state.pendingFiles.push(item);
    }
    renderFilePreview();
  }

  function readAsDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }

  function renderFilePreview() {
    if (!state.pendingFiles.length) { dom.filePreview.classList.add('hidden'); dom.filePreview.innerHTML = ''; return; }
    dom.filePreview.classList.remove('hidden');
    dom.filePreview.innerHTML = state.pendingFiles.map((f, i) => `<span class="file-chip">${f.isImage ? '🖼️' : '📄'} ${esc(f.name)} <button type="button" data-remove-file="${i}">×</button></span>`).join('');
  }

  function buildSystemPrompt(p) {
    const verbosity = { short: '1-2 段', medium: '3-5 段', long: '5-8 段', verylong: '8 段以上' }[state.settings.verbosity] || '5-8 段';
    let prompt = p.systemPrompt ? `${p.systemPrompt}\n\n` : '';
    if (state.mode === 'debate') {
      prompt += `你正在参加一场围绕「${state.topic}」的辩论。你的名字是 ${p.name}。`;
      if (p.stance) prompt += `你的立场是：${p.stance}。`;
      prompt += `请坚持你的立场，回应对手观点，使用事实、例子和逻辑。回复长度约 ${verbosity}。`;
    } else if (state.mode === 'cooperation') {
      const finalizer = activeOrder[activeOrder.length - 1];
      const isFinalizer = finalizer && finalizer.id === p.id;
      prompt += `你正在和其他 AI 合作为目标「${state.topic}」共同努力。你的名字是 ${p.name}。`;
      if (isFinalizer) {
        prompt += `你是本次合作的最后总结者。请不要提出零散的新方向，而是整合前面所有成员的贡献，输出最终结果、关键结论、执行步骤和需要注意的风险。回复长度约 ${verbosity}。`;
      } else {
        prompt += `你是合作成员。请提出可执行的想法、分析、方案、分工建议或对已有内容的补充，帮助团队接近目标。不要与其他成员辩论胜负。回复长度约 ${verbosity}。`;
      }
    } else {
      prompt += `你正在参加一场围绕「${state.topic}」的友好讨论。你的名字是 ${p.name}。请回应用户和其他同伴的观点，保持自然、有帮助、有洞察。回复长度约 ${verbosity}。`;
    }
    if (state.settings.globalInstructions) prompt += `\n\n全局附加指令：${state.settings.globalInstructions}`;
    return prompt;
  }

  function buildMessagesFor(p) {
    const messages = [{ role: 'system', content: buildSystemPrompt(p) }];
    for (const m of state.messages) {
      if (m.role === 'assistant' && m.speakerId === p.id) messages.push({ role: 'assistant', content: m.content, files: m.files || [] });
      else messages.push({ role: 'user', content: `[${m.speakerName}]: ${m.content}`, files: m.files || [] });
    }
    const others = state.participants.filter(x => x.id !== p.id).map(x => x.name).join('、');
    const hasPrior = state.messages.length > 0;
    const finalizer = state.mode === 'cooperation' ? activeOrder[activeOrder.length - 1] : null;
    const isFinalizer = finalizer && finalizer.id === p.id;
    let instruction;
    if (!hasPrior) {
      instruction = state.mode === 'debate'
        ? `你是本场辩论第一个发言者。当前还没有任何其他人发言，不要感谢、回应或引用不存在的前文。请直接提出你的开场论点。其他参与者：${others || '无'}。`
        : state.mode === 'cooperation'
          ? `你是本次合作第一个发言者。当前还没有任何其他成员发言，不要感谢、回应或引用不存在的前文。请直接围绕目标提出初始方案、关键问题和下一步建议。其他成员：${others || '无'}。`
          : `你是本次讨论第一个发言者。当前还没有任何其他人发言，不要感谢、回应或引用不存在的前文。请直接围绕话题给出你的观点。其他成员：${others || '无'}。`;
    } else if (state.mode === 'debate') {
      instruction = `轮到你发言。请回应 ${others || '其他人'} 的观点，并继续推进论证。`;
    } else if (state.mode === 'cooperation') {
      instruction = isFinalizer
        ? `你是最后总结者。请基于上文整合所有成员贡献，输出最终结果。不要感谢不存在的发言，只总结真实已有内容。`
        : `轮到你协作补充。请结合上文推进目标，提出新的可执行贡献，避免重复。`;
    } else {
      instruction = `轮到你回应。请结合上文和用户消息自然发言。`;
    }
    messages.push({ role: 'user', content: instruction });
    return messages;
  }

  function buildJudgeMessages() {
    const transcript = state.messages
      .filter(m => m.speakerId !== state.judge.id)
      .map(m => `【${m.speakerName}】\n${m.content}`)
      .join('\n\n');
    const system = `${state.judge.systemPrompt || '你是一位中立、严谨的辩论裁判。'}\n\n你不会参加辩论过程，只在辩论结束后总结。请基于完整辩论记录评估：\n1. 各方核心论点\n2. 证据质量\n3. 逻辑漏洞\n4. 交锋中最关键的分歧\n5. 最终胜方或平局判断\n6. 给每位参与者简短反馈\n\n请用中文输出，结论要明确。`;
    return [
      { role: 'system', content: system },
      { role: 'user', content: `辩论主题：${state.topic}\n\n完整辩论记录：\n\n${transcript || '[没有辩论记录]'}` },
    ];
  }

  function openAiContent(content, files) {
    if (!files || !files.length) return content;
    const parts = [{ type: 'text', text: content || '请分析这些附件。' }];
    for (const f of files) {
      if (f.isImage) parts.push({ type: 'image_url', image_url: { url: `data:${f.type};base64,${f.data}` } });
      else parts.push({ type: 'text', text: `[File: ${f.name}]\n${f.text || ''}` });
    }
    return parts;
  }

  function formatOpenAiMessages(messages) {
    return messages.map(m => ({ role: m.role, content: openAiContent(m.content, m.files) }));
  }

  async function* streamOpenAiLike(p, messages, signal) {
    const base = (p.baseURL || DEFAULTS[p.provider] || '').replace(/\/$/, '');
    if (!base) throw new Error('缺少 Base URL');
    const url = `${base}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: Object.assign({ 'Content-Type': 'application/json' }, p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}, p.provider === 'openrouter' ? { 'HTTP-Referer': location.href, 'X-Title': 'AI Debate Arena Browser' } : {}),
      body: JSON.stringify({ model: p.model, messages: formatOpenAiMessages(messages), stream: true, temperature: p.temperature, max_tokens: p.maxTokens }),
    });
    if (!res.ok) throw await responseError(res, url);
    yield* parseSse(res, json => json.choices?.[0]?.delta?.content || '');
  }

  async function* streamGoogle(p, messages, signal) {
    const base = (p.baseURL || DEFAULTS.google).replace(/\/$/, '');
    const system = messages.find(m => m.role === 'system')?.content || '';
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: googleParts(m.content, m.files) }));
    const url = `${base}/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(p.apiKey)}`;
    const res = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: p.temperature, maxOutputTokens: p.maxTokens } }) });
    if (!res.ok) throw await responseError(res, url);
    yield* parseSse(res, json => json.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '');
  }

  function googleParts(content, files) {
    const parts = [{ text: content || '请分析这些附件。' }];
    for (const f of files || []) {
      if (f.isImage) parts.push({ inlineData: { mimeType: f.type, data: f.data } });
      else parts.push({ text: `[File: ${f.name}]\n${f.text || ''}` });
    }
    return parts;
  }

  async function* streamAnthropic(p, messages, signal) {
    const base = (p.baseURL || DEFAULTS.anthropic).replace(/\/$/, '');
    const system = messages.find(m => m.role === 'system')?.content || '';
    const chat = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: anthropicContent(m.content, m.files) }));
    const url = `${base}/messages`;
    const res = await fetch(url, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: p.model, system, messages: chat, stream: true, max_tokens: p.maxTokens, temperature: p.temperature }),
    });
    if (!res.ok) throw await responseError(res, url);
    yield* parseSse(res, json => json.type === 'content_block_delta' ? (json.delta?.text || json.delta?.thinking || '') : '');
  }

  function anthropicContent(content, files) {
    const parts = [{ type: 'text', text: content || '请分析这些附件。' }];
    for (const f of files || []) {
      if (f.isImage) parts.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
      else parts.push({ type: 'text', text: `[File: ${f.name}]\n${f.text || ''}` });
    }
    return parts;
  }

  async function* parseSse(res, pickText) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 524288) buffer = buffer.slice(-262144);
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const event of events) {
        for (const line of event.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try { const text = pickText(JSON.parse(data)); if (text) yield text; } catch (_) {}
        }
      }
    }
  }

  async function responseError(res, url) {
    let body = '';
    try { body = await res.text(); } catch (_) {}
    const hint = res.status === 401 ? 'API Key 无效或权限不足' : res.status === 404 ? 'Base URL 或模型路径可能不正确' : res.status === 429 ? '请求被限流或额度不足' : res.status >= 500 ? '模型服务端错误' : '请求失败';
    return new Error(`${hint}\nURL: ${safeUrl(url || res.url)}\nHTTP Status: ${res.status} ${res.statusText}\n响应体:\n${body || '[空响应体]'}`);
  }

  function safeUrl(url) {
    return String(url || '').replace(/([?&](?:key|api_key|apikey)=)[^&]+/ig, '$1[已隐藏]');
  }

  function fullErrorText(err) {
    return `错误名称: ${err?.name || '未知'}\n错误信息: ${err?.message || String(err)}\n错误堆栈:\n${err?.stack || '[无堆栈]'}`;
  }

  async function* streamParticipant(p, messages, signal) {
    try {
      if (p.provider === 'google') yield* streamGoogle(p, messages, signal);
      else if (p.provider === 'anthropic') yield* streamAnthropic(p, messages, signal);
      else yield* streamOpenAiLike(p, messages, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (String(err.message || '').includes('Failed to fetch')) {
        throw new Error(`网络请求失败，常见原因是 CORS 限制、Base URL 不可访问或网络异常。\n原始错误名称: ${err.name || '未知'}\n原始错误信息: ${err.message || String(err)}\n原始堆栈:\n${err.stack || '[无堆栈]'}\n当前 Provider: ${p.provider}\nBase URL: ${safeUrl(p.baseURL || DEFAULTS[p.provider] || '[空]')}\n模型: ${p.model || '[空]'}\n建议: 优先使用 OpenRouter 或支持浏览器 CORS 的 OpenAI 兼容网关。`);
      }
      throw err;
    }
  }

  async function askParticipant(p) {
    const modelMessages = buildMessagesFor(p);
    const message = { id: uid(), role: 'assistant', speakerId: p.id, speakerName: p.name, color: p.color, content: '', createdAt: Date.now(), files: [] };
    state.messages.push(message);
    const bubble = addMessage(message);
    currentAssistant = message;
    try {
      for await (const chunk of streamParticipant(p, modelMessages, abortController.signal)) {
        message.content += chunk;
        appendToBubble(bubble, chunk);
      }
      if (!message.content.trim()) message.content = '[没有收到模型输出]';
    } catch (err) {
      if (err.name === 'AbortError') { message.content += '\n[已停止]'; appendToBubble(bubble, '\n[已停止]'); forceRender(bubble); return; }
      message.error = true;
      message.content = `[错误]\n${fullErrorText(err)}`;
      bubble.dataset.raw = message.content;
      bubble.classList.add('error');
      forceRender(bubble);
    } finally {
      currentAssistant = null;
      saveConfig();
    }
  }

  async function askJudgeSummary() {
    const p = state.judge;
    const modelMessages = buildJudgeMessages();
    const message = { id: uid(), role: 'assistant', speakerId: p.id, speakerName: p.name || 'Judge', color: p.color || '#fbbf24', content: '', createdAt: Date.now(), files: [] };
    state.messages.push(message);
    addDivider('裁判总结');
    const bubble = addMessage(message);
    try {
      for await (const chunk of streamParticipant(p, modelMessages, abortController.signal)) {
        message.content += chunk;
        appendToBubble(bubble, chunk);
      }
      if (!message.content.trim()) message.content = '[裁判没有输出总结]';
    } catch (err) {
      if (err.name === 'AbortError') { message.content += '\n[已停止]'; appendToBubble(bubble, '\n[已停止]'); forceRender(bubble); return; }
      message.error = true;
      message.content = `[裁判错误]\n${fullErrorText(err)}`;
      bubble.dataset.raw = message.content;
      bubble.classList.add('error');
      forceRender(bubble);
    } finally {
      saveConfig();
    }
  }

  async function startSession() {
    if (state.active) return;
    state.topic = dom.topic.value.trim();
    state.rounds = clampNumber(dom.rounds.value, 3, 1, 10);
    state.settings.verbosity = dom.verbosity.value;
    state.settings.globalInstructions = dom.globalInstructions.value.trim();
    const min = state.mode === 'debate' ? 2 : state.mode === 'cooperation' ? 2 : 1;
    if (!state.topic) return alert('请输入主题');
    if (state.participants.length < min) return alert(`至少需要 ${min} 个参与者`);
    for (const p of state.participants) if (!p.model) return alert(`${p.name} 缺少模型名称`);
    if (state.mode === 'debate' && state.judgeEnabled && !state.judge.model) return alert('裁判缺少模型名称');
    abortController = new AbortController();
    activeOrder = shuffle(state.participants);
    state.messages = [];
    dom.messages.innerHTML = '';
    setActive(true);
    saveConfig();
    addDivider(`${state.mode === 'debate' ? '辩论' : state.mode === 'cooperation' ? '合作' : '讨论'}：${state.topic}`);
    addDivider(`本次发言顺序：${activeOrder.map(p => p.name).join(' → ')}`);
    if (state.pendingFiles.length) {
      const files = state.pendingFiles.splice(0);
      renderFilePreview();
      const msg = { id: uid(), role: 'user', speakerId: 'user', speakerName: 'User', color: '#000080', content: '请分析这些附件。', files, createdAt: Date.now() };
      state.messages.push(msg);
      addMessage(msg);
    }
    if (state.mode === 'debate') await runDebate();
    else if (state.mode === 'cooperation') await runCooperation();
    else addDivider('讨论已开始，请输入消息。');
  }

  async function runDebate() {
    try {
      for (let round = 1; round <= state.rounds; round++) {
        if (abortController.signal.aborted) break;
        state.currentRound = round;
        addDivider(`第 ${round} / ${state.rounds} 轮`);
        for (const p of activeOrder) {
          if (abortController.signal.aborted) break;
          await askParticipant(p);
        }
      }
      if (!abortController.signal.aborted) {
        addDivider('辩论结束');
        if (state.judgeEnabled) await askJudgeSummary();
      }
    } finally {
      setActive(false);
    }
  }

  async function runDiscussionResponses() {
    for (const p of activeOrder) {
      if (abortController.signal.aborted) break;
      await askParticipant(p);
    }
  }

  async function runCooperation() {
    try {
      const finalizer = activeOrder[activeOrder.length - 1];
      for (let round = 1; round <= state.rounds; round++) {
        if (abortController.signal.aborted) break;
        state.currentRound = round;
        addDivider(`第 ${round} / ${state.rounds} 轮`);
        if (round === state.rounds) {
          const others = activeOrder.filter(p => p.id !== finalizer?.id);
          for (const p of others) {
            if (abortController.signal.aborted) break;
            await askParticipant(p);
          }
          if (!abortController.signal.aborted) {
            addDivider('最终总结');
            await askParticipant(finalizer);
          }
        } else {
          for (const p of activeOrder) {
            if (abortController.signal.aborted) break;
            await askParticipant(p);
          }
        }
      }
      if (!abortController.signal.aborted) addDivider('合作完成');
    } finally {
      setActive(false);
    }
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function sendUserMessage(content) {
    if (!state.active || !abortController || abortController.signal.aborted) return;
    const files = state.pendingFiles.splice(0);
    renderFilePreview();
    const text = content.trim() || (files.length ? '请分析这些附件。' : '');
    if (!text && !files.length) return;
    const msg = { id: uid(), role: 'user', speakerId: 'user', speakerName: 'User', color: '#000080', content: text, files, createdAt: Date.now() };
    state.messages.push(msg);
    addMessage(msg);
    dom.userInput.value = '';
    if (state.mode === 'discussion') {
      abortController = new AbortController();
      await runDiscussionResponses();
    }
  }

  function stopSession() {
    if (abortController) abortController.abort();
  }

  async function discoverModelsForSelected(testOnly) {
    const p = state.participants[Number(dom.discoverParticipant.value)];
    if (!p) return;
    dom.modelResults.textContent = testOnly ? '正在测试连接...' : '正在获取模型列表...';
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20000);
    try {
      const models = await discoverModels(p, controller.signal);
      if (testOnly) { dom.modelResults.textContent = `连接成功。可读取 ${models.length} 个模型。`; return; }
      dom.modelResults.innerHTML = models.slice(0, 80).map(m => `<button class="model-row ghost-btn" type="button" data-model="${esc(m.id)}">${esc(m.id)} · ${m.contextWindow ? Number(m.contextWindow).toLocaleString() + ' 上下文' : '未知上下文'}${m.supportsVision ? ' · 图片' : ''}</button>`).join('') || '没有返回模型。';
    } catch (err) {
      dom.modelResults.textContent = err.name === 'AbortError' ? '请求超时。' : fullErrorText(err);
    }
  }

  async function discoverModels(p, signal) {
    if (p.provider === 'google') {
      const base = (p.baseURL || DEFAULTS.google).replace(/\/$/, '');
      const url = `${base}/models?key=${encodeURIComponent(p.apiKey)}`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw await responseError(res, url);
      const json = await res.json();
      return (json.models || []).map(m => mergePreset(m.name.replace(/^models\//, ''), { contextWindow: m.inputTokenLimit, maxOutputTokens: m.outputTokenLimit, source: 'api' }));
    }
    const base = (p.baseURL || DEFAULTS[p.provider] || '').replace(/\/$/, '');
    if (!base) throw new Error('缺少 Base URL');
    const headers = Object.assign({}, p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}, p.provider === 'anthropic' ? { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : {});
    const url = `${base}/models`;
    const res = await fetch(url, { signal, headers });
    if (!res.ok) throw await responseError(res, url);
    const json = await res.json();
    return (json.data || json.models || []).map(m => mergePreset(m.id || m.name, { contextWindow: m.context_length || m.contextWindow || m.inputTokenLimit, maxOutputTokens: m.max_completion_tokens || m.maxOutputTokens, supportsVision: /image|vision/i.test(JSON.stringify(m)), source: 'api' }));
  }

  function mergePreset(id, info) {
    const preset = MODEL_PRESETS[id] || MODEL_PRESETS[id?.replace(/^models\//, '')] || {};
    return Object.assign({ id, contextWindow: '', maxOutputTokens: '', supportsVision: false, supportsThinking: false, source: 'unknown' }, preset, info, { id });
  }

  function modeLabel() {
    return state.mode === 'debate' ? '辩论' : state.mode === 'cooperation' ? '合作' : '讨论';
  }

  function exportMarkdown() {
    const lines = [`# ${modeLabel()}：${state.topic}`, '', `导出时间：${new Date().toLocaleString()}`, ''];
    for (const m of state.messages) {
      lines.push(`## ${m.speakerName}`, '', m.content || '', '');
      if (m.files?.length) lines.push(`附件：${m.files.map(f => f.name).join(', ')}`, '');
    }
    download(`${state.mode}-${Date.now()}.md`, lines.join('\n'), 'text/markdown');
  }

  function exportJson() { const { apiKey, ...judge } = state.judge; download(`${state.mode}-${Date.now()}.json`, JSON.stringify({ mode: state.mode, topic: state.topic, judgeEnabled: state.judgeEnabled, judge, participants: state.participants.map(({ apiKey, ...rest }) => rest), messages: state.messages }, null, 2), 'application/json'); }
  function download(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  document.querySelectorAll('.mode-tab').forEach(btn => btn.addEventListener('click', () => {
    if (state.active) return;
    state.mode = btn.dataset.mode;
    if (state.mode === 'discussion' && state.participants.length < 1) state.participants.push(participant({ name: 'Companion', color: COLORS[0] }));
    if (state.mode === 'cooperation' && state.topic === '人工智能是否会取代人类的大部分工作？') state.topic = '制定一个可执行的产品发布方案';
    syncInputs();
    saveConfig();
  }));
  ['input', 'change'].forEach(evt => {
    dom.topic.addEventListener(evt, () => { state.topic = dom.topic.value; saveConfig(); });
    dom.rounds.addEventListener(evt, () => { state.rounds = clampNumber(dom.rounds.value, 3, 1, 10); saveConfig(); });
    dom.globalInstructions.addEventListener(evt, () => { state.settings.globalInstructions = dom.globalInstructions.value; saveConfig(); });
    dom.verbosity.addEventListener(evt, () => { state.settings.verbosity = dom.verbosity.value; saveConfig(); });
  });
  $('addParticipant').addEventListener('click', () => openParticipant(-1));
  $('bulkConfig').addEventListener('click', openBulkConfig);
  $('editJudge').addEventListener('click', openJudge);
  $('judgeEnabled').addEventListener('change', e => { state.judgeEnabled = e.target.checked; saveConfig(); });
  $('pProvider').addEventListener('change', () => { const provider = $('pProvider').value; if (!$('pBaseURL').value || Object.values(DEFAULTS).includes($('pBaseURL').value)) $('pBaseURL').value = DEFAULTS[provider] || ''; const preset = PROVIDER_DEFAULTS[provider]; if (preset) { $('pModel').value = preset.model; $('pContext').value = preset.contextWindow; $('pMaxTokens').value = preset.maxOutputTokens; } });
  $('bProvider').addEventListener('change', () => { const provider = $('bProvider').value; if (!$('bBaseURL').value || Object.values(DEFAULTS).includes($('bBaseURL').value)) $('bBaseURL').value = DEFAULTS[provider] || ''; const preset = PROVIDER_DEFAULTS[provider]; if (preset) { $('bModel').value = preset.model; $('bContext').value = preset.contextWindow; $('bMaxTokens').value = preset.maxOutputTokens; } });
  $('saveParticipant').addEventListener('click', saveParticipantFromDialog);
  $('applyBulkConfig').addEventListener('click', applyBulkConfig);
  $('deleteParticipant').addEventListener('click', () => { const index = Number($('editIndex').value); if (index >= 0) { state.participants.splice(index, 1); dom.dialog.close(); renderParticipants(); renderDiscoverOptions(); saveConfig(); } });
  dom.startBtn.addEventListener('click', startSession);
  dom.stopBtn.addEventListener('click', stopSession);
  dom.clearBtn.addEventListener('click', () => { if (state.active) stopSession(); state.messages = []; dom.messages.innerHTML = '<div class="welcome"><div class="logo-mark">A</div><h2>AI Debate Arena</h2><p>配置 Provider 和角色后即可开始。浏览器直连 API 可能受 CORS 限制，推荐优先使用 OpenRouter。</p></div>'; });
  dom.composer.addEventListener('submit', async e => { e.preventDefault(); await sendUserMessage(dom.userInput.value); });
  dom.pickFiles.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', async () => { await processFiles(dom.fileInput.files); dom.fileInput.value = ''; });
  dom.filePreview.addEventListener('click', e => { const btn = e.target.closest('[data-remove-file]'); if (!btn) return; state.pendingFiles.splice(Number(btn.dataset.removeFile), 1); renderFilePreview(); });
  $('discoverModels').addEventListener('click', () => discoverModelsForSelected(false));
  $('testConnection').addEventListener('click', () => discoverModelsForSelected(true));
  dom.modelResults.addEventListener('click', e => { const btn = e.target.closest('[data-model]'); if (!btn) return; const p = state.participants[Number(dom.discoverParticipant.value)]; p.model = btn.dataset.model; const merged = mergePreset(p.model, {}); p.contextWindow = merged.contextWindow || p.contextWindow; p.maxTokens = merged.maxOutputTokens || p.maxTokens; p.supportsVision = merged.supportsVision || p.supportsVision; renderParticipants(); saveConfig(); });
  $('exportMd').addEventListener('click', exportMarkdown);
  $('exportJson').addEventListener('click', exportJson);
  $('openPanel').addEventListener('click', () => { dom.panel.classList.add('open'); $('panelOverlay').classList.add('show'); });
  $('closePanel').addEventListener('click', () => { dom.panel.classList.remove('open'); $('panelOverlay').classList.remove('show'); });
  $('panelOverlay').addEventListener('click', () => { dom.panel.classList.remove('open'); $('panelOverlay').classList.remove('show'); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'applyZoom' && e.data.zoom) {
      document.documentElement.style.zoom = e.data.zoom;
    }
  });

  syncInputs();
})();
