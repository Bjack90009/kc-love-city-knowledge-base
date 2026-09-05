const DATA = window.KNOWLEDGE_DATA;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const state = {
  termMap: new Map(),
  blockMap: new Map(),
  headingMap: new Map(),
  configMap: new Map(),
  termPattern: null,
  lastTrigger: null,
  updatedSet: new Set(),
  compareEntries: [],
  compareIndex: 0,
};

function prepareIndexes() {
  DATA.terms.forEach((term) => state.termMap.set(term.name, term));
  DATA.blocks.forEach((block) => state.blockMap.set(block.id, block));
  DATA.headings.forEach((heading) => state.headingMap.set(heading.id, heading));
  DATA.config_tables.forEach((table) => state.configMap.set(table.name, table));
  (DATA.versioning?.recent_updated_block_ids || []).forEach((id) => state.updatedSet.add(id));
  const names = DATA.terms
    .filter((term) => term.inline !== false)
    .map((term) => term.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  state.termPattern = names.length ? new RegExp(`(${names.map(escapeRegExp).join('|')})`, 'g') : null;
}

function updateBadge(blockId) {
  if (!state.updatedSet.has(blockId)) return '';
  const entries = DATA.versioning?.block_history?.[blockId] || [];
  const latest = entries[0];
  if (!latest) return '';
  const label = latest.badge_label || `${latest.date || ''} 更新`;
  return `<button class="update-badge" type="button" data-block-history="${escapeHtml(blockId)}" aria-label="查看 ${escapeHtml(latest.version)} 的正文差异">${escapeHtml(label)}</button>`;
}

function renderInline(text) {
  const raw = String(text ?? '');
  if (!state.termPattern) return escapeHtml(raw).replace(/\n/g, '<br />');
  return raw.split(state.termPattern).map((part) => {
    if (!part) return '';
    if (!state.termMap.has(part) || state.termMap.get(part).inline === false) {
      return escapeHtml(part).replace(/\n/g, '<br />');
    }
    const safe = escapeHtml(part);
    const codeLike = /MusicCity_|^[a-z][a-z0-9_]{2,}$|^F\d{2}(?:[.-]\d+)?$|show_id/.test(part);
    return `<button type="button" class="term-link${codeLike ? ' term-code' : ''}" data-term="${safe}" aria-haspopup="dialog" aria-label="查看 ${safe} 的关联说明">${codeLike ? `<code>${safe}</code>` : safe}</button>`;
  }).join('');
}

function renderTable(block) {
  const [head = [], ...body] = block.rows || [];
  return `<div class="table-scroll" id="${block.id}" data-block-id="${block.id}" data-source-table="${escapeHtml(block.source_table || '')}">
    <table>
      <thead><tr>${head.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>
      <tbody>${body.map((row) => `<tr>${head.map((_, index) => `<td>${renderInline(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>${updateBadge(block.id)}
  </div>`;
}

function headingSectionNumber(text) {
  return String(text || '').match(/^\s*(\d+(?:\.\d+)*)/)?.[1] || '';
}

function renderDocument() {
  const output = [];
  let index = 0;
  while (index < DATA.blocks.length) {
    const block = DATA.blocks[index];
    if (block.kind === 'heading') {
      const number = headingSectionNumber(block.text);
      output.push(`<h${block.level} id="${block.id}" data-block-id="${block.id}"${block.level === 2 ? ` data-section="${escapeHtml(number)}"` : ''}>${escapeHtml(block.text)}${updateBadge(block.id)}</h${block.level}>`);
      index += 1;
      continue;
    }
    if (block.kind === 'paragraph') {
      output.push(`<p id="${block.id}" data-block-id="${block.id}">${renderInline(block.text)}${updateBadge(block.id)}</p>`);
      index += 1;
      continue;
    }
    if (block.kind === 'caption') {
      output.push(`<p class="document-caption" id="${block.id}" data-block-id="${block.id}">${renderInline(block.text)}${updateBadge(block.id)}</p>`);
      index += 1;
      continue;
    }
    if (block.kind === 'list_item') {
      const tag = block.ordered ? 'ol' : 'ul';
      const level = block.level || 0;
      const items = [];
      while (index < DATA.blocks.length) {
        const item = DATA.blocks[index];
        if (item.kind !== 'list_item' || Boolean(item.ordered) !== Boolean(block.ordered) || (item.level || 0) !== level) break;
        items.push(item);
        index += 1;
      }
      output.push(`<${tag} class="document-list level-${level}">${items.map((item) => `<li id="${item.id}" data-block-id="${item.id}">${renderInline(item.text)}${updateBadge(item.id)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (block.kind === 'table') {
      output.push(renderTable(block));
      index += 1;
      continue;
    }
    if (block.kind === 'image') {
      const next = DATA.blocks[index + 1];
      const heading = state.headingMap.get(block.section_id);
      const generatedCaption = `系统文档插图 · ${heading?.text || '正文说明'}`;
      const caption = next?.kind === 'caption' ? next.text : generatedCaption;
      output.push(`<figure id="${block.id}" data-block-id="${block.id}"><button class="image-open" type="button" data-image-src="${escapeHtml(block.src)}" data-image-caption="${escapeHtml(caption)}" aria-label="放大查看：${escapeHtml(caption)}"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(caption)}" loading="lazy" /></button><figcaption>${escapeHtml(caption)}${updateBadge(block.id)}${next?.kind === 'caption' ? updateBadge(next.id) : ''}</figcaption></figure>`);
      index += next?.kind === 'caption' ? 2 : 1;
      continue;
    }
    index += 1;
  }
  $('#doc-content').innerHTML = output.join('\n');
}

function renderToc() {
  const items = DATA.headings.filter((heading) => heading.level >= 2);
  $('#toc').innerHTML = items.map((heading) => `<a class="level-${heading.level}" href="#${heading.id}">${escapeHtml(heading.text)}</a>`).join('');
  updateActiveToc();
}

function renderUpdates() {
  const update = DATA.versioning?.recent_update;
  if (!update) return;
  $('#recent-update-version').textContent = `${update.version} · ${update.date}`;
  $('#recent-update-title').textContent = update.title;
  $('#recent-update-summary').textContent = update.summary;
  const currentDocument = $('#current-document-version');
  if (currentDocument) currentDocument.textContent = `当前文档 ${update.version} · ${update.date}`;
}

function currentTopSection(blockId) {
  const blockIndex = DATA.blocks.findIndex((block) => block.id === blockId);
  if (blockIndex < 0) return null;
  for (let index = blockIndex; index >= 0; index -= 1) {
    const block = DATA.blocks[index];
    if (block.kind === 'heading' && block.level === 2) return block;
  }
  return null;
}

function updateActiveToc() {
  const tocLinks = [...document.querySelectorAll('#toc a')];
  if (!tocLinks.length) return;
  let active = tocLinks[0];
  tocLinks.forEach((link) => {
    const heading = document.getElementById(link.hash.slice(1));
    if (heading && heading.getBoundingClientRect().top <= 150) active = link;
  });
  tocLinks.forEach((link) => {
    const isActive = link === active;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function blockText(block) {
  if (!block) return '';
  if (block.kind === 'table') return (block.rows || []).map((row) => row.join(' · ')).join(' / ');
  return block.text || '';
}

function blockExcerpt(block, match) {
  const text = blockText(block).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const needle = String(match || '');
  const hit = needle ? text.indexOf(needle) : -1;
  const start = Math.max(0, hit >= 0 ? hit - 90 : 0);
  const end = Math.min(text.length, hit >= 0 ? hit + needle.length + 150 : 260);
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function referenceTitle(block) {
  if (!block) return '正文区块';
  if (block.kind === 'heading') return block.text;
  const heading = state.headingMap.get(block.section_id);
  if (heading) return heading.text;
  return currentTopSection(block.id)?.text || '正文区块';
}

function normalizedReferences(term) {
  const seen = new Set();
  return (term.references || []).map((ref) => typeof ref === 'string' ? { block_id: ref, match: term.name } : ref)
    .filter((ref) => ref?.block_id && !seen.has(ref.block_id) && seen.add(ref.block_id));
}

function renderReferencePreviews(term) {
  const refs = normalizedReferences(term).map((ref) => ({ ref, block: state.blockMap.get(ref.block_id) })).filter((item) => item.block);
  if (!refs.length) return '<p class="muted">当前正文中没有找到可回读区块。</p>';
  return refs.slice(0, 12).map(({ ref, block }) => `<button class="drawer-preview" type="button" data-jump-id="${escapeHtml(block.id)}" data-jump-term="${escapeHtml(ref.match || term.name)}">
    <span class="drawer-preview-source">${escapeHtml(referenceTitle(block))}</span>
    <span class="drawer-preview-excerpt">${escapeHtml(blockExcerpt(block, ref.match || term.name))}</span>
    <span class="drawer-preview-action">定位到正文出现位置 →</span>
  </button>`).join('');
}

function renderKeyPoints(term) {
  const points = term.usage_points || term.key_points || [];
  if (!points.length) return '';
  return `<section class="drawer-section"><h3>规则使用位置 <small>自动汇总</small></h3><ul class="key-points">${points.map((point) => `<li>${renderInline(point)}</li>`).join('')}</ul></section>`;
}

function renderRelatedTerms(term) {
  if (!term.related_terms?.length) return '';
  return `<section class="drawer-section"><h3>关联概念</h3><div class="related-terms">${term.related_terms.map((name) => `<button type="button" data-term="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div></section>`;
}

function renderSourceRelationships(term) {
  const relationships = term.source_relationships || [];
  if (!relationships.length) return '';
  return `<section class="drawer-section source-foot"><h3>来源关系</h3><p class="source-check ${term.source_unchanged ? 'is-reused' : 'is-rewritten'}">${escapeHtml(term.rewrite_status || '已检查关联来源')}</p><div class="term-sources">${relationships.map((source) => `<article><strong>${escapeHtml(source.label)}</strong><span>${source.locations.map((item) => `<code>${escapeHtml(item)}</code>`).join('')}</span></article>`).join('')}</div></section>`;
}

function renderTermDetails(term) {
  const details = term.details || {};
  const parts = [];
  if (details.localization) {
    const item = details.localization;
    parts.push(`<section class="drawer-section"><h3>完整文本与参数</h3>
      <div class="localization-card"><code>${escapeHtml(item.key)}</code><blockquote>${renderInline(item.text || '文本待补齐')}</blockquote>
      <dl><div><dt>语言</dt><dd>${escapeHtml(item.locale || 'zh-CN')}</dd></div><div><dt>参数</dt><dd>${renderInline(item.params || '无')}</dd></div><div><dt>使用场景</dt><dd>${renderInline(item.usage || '未注明')}</dd></div><div><dt>来源</dt><dd>${escapeHtml(item.source || 'DOCX 多语言表')}</dd></div></dl></div></section>`);
  }
  if (details.records?.length) {
    parts.push(`<section class="drawer-section"><h3>配置字段证据</h3><div class="config-records">${details.records.map((record) => `<article class="config-record">
      <div class="config-record-title"><strong>${escapeHtml(record.table)}.${escapeHtml(record.field)}</strong><span>${escapeHtml(record.status || '配置表记录')}</span></div>
      <p>${renderInline(record.description || '未提供说明')}</p>
      <dl><div><dt>表格位置</dt><dd><code>${escapeHtml(record.source_location)}</code></dd></div><div><dt>字段格式</dt><dd><code>${escapeHtml(record.format || '未注明')}</code></dd></div><div><dt>内容示例</dt><dd><code>${escapeHtml(record.example || '当前为空')}</code></dd></div><div><dt>正文依据</dt><dd>${escapeHtml(record.source_reference || '配置表记录')}</dd></div></dl>
    </article>`).join('')}</div></section>`);
  }
  if (details.ue?.length) {
    parts.push(`<section class="drawer-section"><h3>对应 UE 画板</h3><div class="ue-links">${details.ue.map((node) => `<a href="${escapeHtml(node.url)}" target="_blank" rel="noreferrer"><b>${escapeHtml(node.ux_id)}</b><span>${escapeHtml(node.label)}</span><small>节点 ${escapeHtml(node.node_id)} ↗</small></a>`).join('')}</div></section>`);
  }
  return parts.join('');
}

function showDrawer() {
  $('#drawer-backdrop').hidden = false;
  $('#detail-drawer').classList.add('open');
  $('#detail-drawer').setAttribute('aria-hidden', 'false');
  $('#drawer-close').focus({ preventScroll: true });
}

function openTermDrawer(name, trigger) {
  const term = state.termMap.get(name);
  if (!term) return;
  state.lastTrigger = trigger || document.activeElement;
  $('#drawer-kicker').textContent = `${term.type} · ${term.status}`;
  $('#drawer-title').textContent = name;
  $('#drawer-content').innerHTML = `<section class="drawer-lead"><p>${escapeHtml(term.summary)}</p></section>
    ${renderKeyPoints(term)}
    ${renderRelatedTerms(term)}
    ${renderTermDetails(term)}
    <section class="drawer-section"><h3>正文回读</h3><p class="drawer-hint">预览以关联词为中心截取；点击后定位到该词实际出现的位置。</p><div class="drawer-previews">${renderReferencePreviews(term)}</div></section>
    ${renderSourceRelationships(term)}`;
  $('#drawer-content').scrollTop = 0;
  showDrawer();
}

function renderConfigFields(table) {
  return table.fields.map((field) => `<article class="config-record">
    <div class="config-record-title"><strong>${escapeHtml(field.field)} · ${escapeHtml(field.label)}</strong><span>${escapeHtml(field.status)}</span></div>
    <p>${renderInline(field.description || '暂无字段说明')}</p>
    <dl><div><dt>表格位置</dt><dd><code>${escapeHtml(field.source_location)}</code></dd></div><div><dt>字段格式</dt><dd><code>${escapeHtml(field.format || '未注明')}</code></dd></div><div><dt>内容示例</dt><dd><code>${escapeHtml(field.example || '当前为空')}</code></dd></div><div><dt>正文依据</dt><dd>${escapeHtml(field.source_reference || '配置表记录')}</dd></div></dl>
  </article>`).join('');
}

function openConfigDrawer(name, trigger) {
  const table = state.configMap.get(name);
  if (!table) return;
  state.lastTrigger = trigger || document.activeElement;
  $('#drawer-kicker').textContent = '正式配置表 · 字段结构与当前示例';
  $('#drawer-title').textContent = table.name;
  $('#drawer-content').innerHTML = `<section class="drawer-lead"><p>该表共 ${table.field_count} 个字段、${table.row_count} 条当前示例记录。以下内容直接读取正式配置工作簿。</p></section>
    <section class="drawer-section overview-section"><div class="section-caption">配置表位置</div><p><code>${escapeHtml(table.source_location)}</code></p></section>
    <section class="drawer-section"><h3>字段格式与内容示例</h3><div class="config-records">${renderConfigFields(table)}</div></section>
    <section class="drawer-section source-foot"><h3>来源状态</h3><p>${DATA.meta.config_snapshot ? `<a href="${escapeHtml(DATA.meta.config_snapshot)}">打开 musicCity.xlsx 冻结快照</a>` : '正式配置源已登记；公开发布包不包含原始工作簿。'}</p></section>`;
  $('#drawer-content').scrollTop = 0;
  showDrawer();
}

function sourceCard(source) {
  const href = source.snapshot_path || source.url;
  const name = source.type === 'docx' ? DATA.meta.source_file : source.type === 'xlsx' ? 'musicCity.xlsx' : source.node_name;
  const hash = source.sha256 || source.snapshot_sha256;
  const location = source.original_path || source.url || '内部来源已登记，公开包不披露本机路径';
  const link = href ? `<a href="${escapeHtml(href)}"${source.type === 'figma' ? ' target="_blank" rel="noreferrer"' : ''}>打开来源 →</a>` : '';
  return `<article class="source-record"><div><span>${escapeHtml(source.type.toUpperCase())}</span><strong>${escapeHtml(name)}</strong></div><p>${escapeHtml(source.authority)}</p><dl><div><dt>来源位置</dt><dd>${escapeHtml(location)}</dd></div>${hash ? `<div><dt>冻结哈希</dt><dd><code>${escapeHtml(hash)}</code></dd></div>` : ''}</dl>${link}</article>`;
}

function openSourceDrawer(trigger) {
  state.lastTrigger = trigger || document.activeElement;
  $('#drawer-kicker').textContent = '来源登记 · 刷新基线';
  $('#drawer-title').textContent = '三类来源与状态';
  const coverage = DATA.coverage || {};
  $('#drawer-content').innerHTML = `<section class="drawer-lead"><p>${escapeHtml(DATA.meta.authority_note)}</p></section>
    <section class="drawer-section"><h3>本次覆盖</h3><div class="coverage-grid"><div><b>${coverage.blocks}</b><span>正文区块</span></div><div><b>${coverage.images}</b><span>文档插图</span></div><div><b>${coverage.config_fields}</b><span>配置字段</span></div><div><b>${coverage.localization_keys}</b><span>多语言 KEY</span></div></div></section>
    <section class="drawer-section"><h3>冻结来源</h3><div class="source-records">${(DATA.sources || []).map(sourceCard).join('')}</div></section>
    <section class="drawer-section"><h3>后续刷新流程</h3><ol class="refresh-steps">${(DATA.refresh?.procedure || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol><div class="manifest-links"><a href="data/source-manifest.json">来源清单</a>${DATA.meta.build_profile === 'public-static' ? '' : '<a href="data/refresh-manifest.json">刷新清单</a>'}</div></section>
    <section class="drawer-section"><h3>文档自身更新记录</h3><div class="revision-table">${(DATA.revision_rows || []).map((row, index) => `<div class="${index === 0 ? 'is-head' : ''}">${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join('')}</div>`).join('')}</div><p class="drawer-hint">公开更新历史以系统文档内容快照为对象；知识站功能、排版与维护不计入其中。</p></section>`;
  $('#drawer-content').scrollTop = 0;
  showDrawer();
}

function closeDrawer({ restoreFocus = true } = {}) {
  hideTooltip();
  $('#detail-drawer').classList.remove('open');
  $('#detail-drawer').setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (!$('#detail-drawer').classList.contains('open')) $('#drawer-backdrop').hidden = true;
  }, 260);
  if (restoreFocus && state.lastTrigger?.focus) state.lastTrigger.focus({ preventScroll: true });
}

function tooltipText(term) {
  const text = term.summary || '点击查看关联说明。';
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function showTooltip(name, anchor) {
  if (window.matchMedia('(hover: none)').matches) return;
  const term = state.termMap.get(name);
  if (!term) return;
  const tooltip = $('#term-tooltip');
  tooltip.innerHTML = `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(tooltipText(term))}</span>`;
  tooltip.setAttribute('aria-hidden', 'false');
  tooltip.classList.add('on');
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(380, window.innerWidth - 28);
  tooltip.style.width = `${width}px`;
  const left = Math.max(14, Math.min(rect.left, window.innerWidth - width - 14));
  const height = tooltip.offsetHeight || 92;
  const top = rect.top > height + 18 ? rect.top - height - 12 : rect.bottom + 12;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(14, top)}px`;
}

function hideTooltip() {
  const tooltip = $('#term-tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('on');
  tooltip.setAttribute('aria-hidden', 'true');
}

function jumpToReference(id, termName = '') {
  const target = document.getElementById(id);
  if (!target) return;
  let focusTarget = target;
  if (termName) {
    const termButtons = [...target.querySelectorAll('.term-link')];
    focusTarget = termButtons.find((button) => button.dataset.term === termName) || target;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  focusTarget.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  history.replaceState(null, '', `#${id}`);
  focusTarget.classList.add('reference-hit');
  window.setTimeout(() => focusTarget.classList.remove('reference-hit'), 1700);
}

function renderAppendix() {
  $('#config-summary-card .appendix-content').innerHTML = `<p class="appendix-intro">正式工作簿共 ${DATA.config_tables.length} 张业务配置表。点击表名可查看表格位置、每个字段格式及当前内容示例。</p><div class="config-index">${DATA.config_tables.map((table) => `<button type="button" data-config-table="${escapeHtml(table.name)}"><strong>${escapeHtml(table.name)}</strong><span>${table.field_count} 字段 · ${table.row_count} 示例行</span><small>${escapeHtml(table.source_location)}</small></button>`).join('')}</div>`;

  $('#ue-summary-card .appendix-content').innerHTML = `<a class="ue-overview" href="${escapeHtml(DATA.ue.source_url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(DATA.ue.snapshot)}" alt="Figma UE 总览" loading="lazy" /><span>打开 Figma UE 总览 →</span></a><p>${escapeHtml(DATA.ue.root_name)}<br />已登记 ${DATA.ue.known_nodes.length} 个关键节点。</p>`;

  const docx = DATA.sources?.find((source) => source.type === 'docx');
  const xlsx = DATA.sources?.find((source) => source.type === 'xlsx');
  $('#source-summary-card .appendix-content').innerHTML = `<dl class="compact-source-list"><div><dt>系统文档</dt><dd>${escapeHtml(docx?.modified_at || DATA.meta.source_modified_at)}</dd></div><div><dt>正式配置</dt><dd>${escapeHtml(xlsx?.modified_at || '已冻结')}</dd></div><div><dt>Figma UE</dt><dd>根节点 ${escapeHtml(DATA.ue.root_node_id)}</dd></div></dl><button class="inline-action" type="button" data-open-sources>查看路径、哈希与刷新流程 →</button>`;

  const uniqueSections = [...new Map(DATA.pending_items.map((item) => {
    const top = currentTopSection(item.block_id);
    return [top?.id || item.section_id, top?.text || referenceTitle(state.blockMap.get(item.block_id))];
  })).entries()];
  $('#pending-summary-card .appendix-content').innerHTML = `<p>正文识别到 <strong>${DATA.pending_items.length}</strong> 处待确认、临时口径或后续补齐说明。知识站完整保留这些状态，没有代填数值或程序结论。</p><div class="pending-links">${uniqueSections.map(([id, title]) => `<button type="button" data-jump-id="${escapeHtml(id)}">${escapeHtml(title)} →</button>`).join('')}</div>`;
}

function diffMarkup(oldText, newText, side) {
  const oldValue = String(oldText || '');
  const newValue = String(newText || '');
  if (!oldValue && !newValue) return '<span class="diff-empty">无文本内容</span>';
  if (!oldValue) return side === 'new' ? `<mark>${escapeHtml(newValue).replace(/\n/g, '<br />')}</mark>` : '<span class="diff-empty">此版本尚无该内容</span>';
  if (!newValue) return side === 'old' ? `<mark>${escapeHtml(oldValue).replace(/\n/g, '<br />')}</mark>` : '<span class="diff-empty">此版本已删除该内容</span>';
  let prefix = 0;
  while (prefix < oldValue.length && prefix < newValue.length && oldValue[prefix] === newValue[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldValue.length - prefix && suffix < newValue.length - prefix && oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]) suffix += 1;
  const value = side === 'old' ? oldValue : newValue;
  const middleEnd = value.length - suffix;
  const before = escapeHtml(value.slice(0, prefix));
  const middle = escapeHtml(value.slice(prefix, middleEnd));
  const after = escapeHtml(value.slice(middleEnd));
  return `${before}${middle ? `<mark>${middle}</mark>` : ''}${after}`.replace(/\n/g, '<br />');
}

function renderCompare() {
  const entry = state.compareEntries[state.compareIndex];
  if (!entry) return;
  $('#compare-version').textContent = `${entry.previous_version} → ${entry.version}`;
  $('#compare-meta').textContent = `${entry.date} · ${entry.change_type} · 第 ${entry.chapter} 章`;
  $('#compare-old-label').textContent = entry.previous_version;
  $('#compare-new-label').textContent = entry.version;
  $('#compare-old').innerHTML = diffMarkup(entry.old_text, entry.new_text, 'old');
  $('#compare-new').innerHTML = diffMarkup(entry.old_text, entry.new_text, 'new');
  $('#compare-page').textContent = `${state.compareIndex + 1} / ${state.compareEntries.length}`;
  $('#compare-newer').disabled = state.compareIndex === 0;
  $('#compare-older').disabled = state.compareIndex >= state.compareEntries.length - 1;
}

function openCompare(blockId, trigger) {
  const entries = DATA.versioning?.block_history?.[blockId] || [];
  if (!entries.length) return;
  state.lastTrigger = trigger || document.activeElement;
  state.compareEntries = entries;
  state.compareIndex = 0;
  const block = state.blockMap.get(blockId);
  $('#compare-title').textContent = referenceTitle(block);
  renderCompare();
  $('#compare-backdrop').hidden = false;
  $('#compare-modal').hidden = false;
  requestAnimationFrame(() => $('#compare-modal').classList.add('open'));
  $('#compare-close').focus({ preventScroll: true });
}

function closeCompare() {
  $('#compare-modal').classList.remove('open');
  window.setTimeout(() => {
    $('#compare-modal').hidden = true;
    $('#compare-backdrop').hidden = true;
  }, 180);
  if (state.lastTrigger?.focus) state.lastTrigger.focus({ preventScroll: true });
}

function openLightbox(src, caption, trigger) {
  state.lastTrigger = trigger || document.activeElement;
  $('#lightbox-image').src = src;
  $('#lightbox-image').alt = caption;
  $('#lightbox-caption').textContent = caption;
  $('#image-lightbox').hidden = false;
  requestAnimationFrame(() => $('#image-lightbox').classList.add('open'));
  $('#lightbox-close').focus({ preventScroll: true });
}

function closeLightbox() {
  $('#image-lightbox').classList.remove('open');
  window.setTimeout(() => { $('#image-lightbox').hidden = true; }, 180);
  if (state.lastTrigger?.focus) state.lastTrigger.focus({ preventScroll: true });
}

function bindEvents() {
  document.addEventListener('pointerover', (event) => {
    const target = event.target.closest('.term-link');
    if (target && !(event.relatedTarget && target.contains(event.relatedTarget))) showTooltip(target.dataset.term, target);
  });
  document.addEventListener('pointerout', (event) => {
    const target = event.target.closest('.term-link');
    if (target && !(event.relatedTarget && target.contains(event.relatedTarget))) hideTooltip();
  });
  document.addEventListener('focusin', (event) => {
    const target = event.target.closest('.term-link');
    if (target) showTooltip(target.dataset.term, target);
  });
  document.addEventListener('focusout', (event) => {
    if (event.target.closest('.term-link')) hideTooltip();
  });
  document.addEventListener('click', (event) => {
    const term = event.target.closest('[data-term]');
    if (term) {
      event.preventDefault();
      hideTooltip();
      openTermDrawer(term.dataset.term, term);
      return;
    }
    const historyBadge = event.target.closest('[data-block-history]');
    if (historyBadge) {
      event.preventDefault();
      openCompare(historyBadge.dataset.blockHistory, historyBadge);
      return;
    }
    const imageButton = event.target.closest('[data-image-src]');
    if (imageButton) {
      event.preventDefault();
      openLightbox(imageButton.dataset.imageSrc, imageButton.dataset.imageCaption || '系统文档插图', imageButton);
      return;
    }
    const config = event.target.closest('[data-config-table]');
    if (config) {
      event.preventDefault();
      openConfigDrawer(config.dataset.configTable, config);
      return;
    }
    const sources = event.target.closest('[data-open-sources]');
    if (sources) {
      event.preventDefault();
      openSourceDrawer(sources);
      return;
    }
    const jump = event.target.closest('[data-jump-id]');
    if (jump) {
      event.preventDefault();
      const id = jump.dataset.jumpId;
      const termName = jump.dataset.jumpTerm || '';
      closeDrawer({ restoreFocus: false });
      window.setTimeout(() => jumpToReference(id, termName), 280);
    }
  });
  $('#drawer-close').addEventListener('click', () => closeDrawer());
  $('#drawer-backdrop').addEventListener('click', () => closeDrawer());
  $('#open-source-button').addEventListener('click', (event) => openSourceDrawer(event.currentTarget));
  $('#open-status-button').addEventListener('click', (event) => openSourceDrawer(event.currentTarget));
  $('#source-banner-button').addEventListener('click', (event) => openSourceDrawer(event.currentTarget));
  $('#print-button').addEventListener('click', () => window.print());
  $('#toc-expand-button').addEventListener('click', (event) => {
    const workspace = $('#document');
    const expanded = workspace.classList.toggle('toc-expanded');
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
    event.currentTarget.querySelector('span').textContent = expanded ? '收起目录' : '展开目录';
  });
  $('#compare-close').addEventListener('click', closeCompare);
  $('#compare-backdrop').addEventListener('click', closeCompare);
  $('#compare-older').addEventListener('click', () => { if (state.compareIndex < state.compareEntries.length - 1) { state.compareIndex += 1; renderCompare(); } });
  $('#compare-newer').addEventListener('click', () => { if (state.compareIndex > 0) { state.compareIndex -= 1; renderCompare(); } });
  $('#lightbox-close').addEventListener('click', closeLightbox);
  $('#image-lightbox').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeLightbox(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('#detail-drawer').classList.contains('open')) closeDrawer();
    else if (event.key === 'Escape' && !$('#compare-modal').hidden) closeCompare();
    else if (event.key === 'Escape' && !$('#image-lightbox').hidden) closeLightbox();
  });
  let scrollFrame = null;
  window.addEventListener('scroll', () => {
    hideTooltip();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { updateActiveToc(); scrollFrame = null; });
  }, { passive: true });
}

function init() {
  if (!DATA?.blocks?.length) {
    $('#doc-content').innerHTML = '<div class="loading-state"><p>知识站数据读取失败，请确认 data/document-data.js 存在。</p></div>';
    return;
  }
  prepareIndexes();
  renderUpdates();
  renderDocument();
  renderToc();
  renderAppendix();
  bindEvents();
}

init();
