(() => {
  'use strict';

  const history = window.KNOWLEDGE_HISTORY;
  const root = document.querySelector('#version-history');

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderChapters(version) {
    const chapters = version.chapter_updates || [];
    if (!chapters.length) return '';
    const rows = chapters.map((item) => {
      const target = item.target_id ? `index.html#${encodeURIComponent(item.target_id)}` : 'index.html';
      const detail = (item.changes || []).map((change) => `<small>${escapeHtml(change)}</small>`).join('');
      return `<div class="chapter-change"><b>第 ${escapeHtml(item.chapter)} 章</b><span>${escapeHtml(item.summary)}${detail}</span><a href="${target}">前往正文</a></div>`;
    }).join('');
    return `<details class="history-chapters" ${version.id === history.current_version ? 'open' : ''}><summary>查看 ${chapters.length} 个章节的正文更新概要</summary>${rows}</details>`;
  }

  function renderVersion(version) {
    const previous = version.comparison?.previous_version;
    const changed = Number(version.comparison?.changed_blocks || 0);
    const highlights = (version.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const comparison = previous
      ? `<p class="muted">相对 ${escapeHtml(previous)}：${changed} 个正文变更记录</p>`
      : '<p class="muted">当前可追溯的系统文档内容起点</p>';
    return `<article class="history-entry" id="version-${escapeHtml(version.id)}">
      <div class="history-meta"><strong>${escapeHtml(version.version || version.id)}</strong><time datetime="${escapeHtml(version.date)}">${escapeHtml(version.date)}</time></div>
      <div>
        <h2>${escapeHtml(version.title)}</h2>
        <p class="history-summary">${escapeHtml(version.summary)}</p>
        ${comparison}
        ${highlights ? `<ul class="history-highlights">${highlights}</ul>` : ''}
        ${renderChapters(version)}
      </div>
    </article>`;
  }

  if (!history?.versions?.length) {
    root.innerHTML = '<p class="muted">暂无可读取的版本历史。</p>';
    return;
  }

  const versions = [...history.versions].sort((a, b) => String(b.source_modified_at || b.generated_at || b.date || '').localeCompare(String(a.source_modified_at || a.generated_at || a.date || '')));
  root.innerHTML = versions.map(renderVersion).join('');
})();
