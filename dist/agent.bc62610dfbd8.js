// Read-only bridge: collect public, currently visible platform state when a question is sent.
// It does not access map internals, storage, credentials, or private location APIs.
const visible = element => Boolean(element?.getClientRects().length);
const text = id => { const element = document.getElementById(id); return visible(element) ? element.innerText : ''; };
window.feiyuAIContextProvider = () => {
  const city = document.getElementById('city-select');
  const province = document.getElementById('province');
  const filters = [...document.querySelectorAll('#planning-panel select,#planning-panel input,#legend input')]
    .filter(element => visible(element) && !element.disabled)
    .map(element => {
      const label = element.closest('label')?.textContent?.trim().slice(0, 50) || element.id;
      const value = element.selectedOptions?.[0]?.textContent ?? (element.type === 'checkbox' ? (element.checked ? '开启' : '关闭') : element.value);
      return `${label}: ${value}`;
    }).join('；');
  return {
    cityId:city?.value || '', province:province?.value || '',
    scope:city?.selectedOptions?.[0]?.textContent || '全国概览',
    mode:document.querySelector('.topbar nav button.active')?.textContent || '',
    filters:[filters, '空域类别：'+[...document.querySelectorAll('#filters button.active')].map(e=>e.textContent).join('、'),
      '规划视图与情景：'+[...document.querySelectorAll('[data-plan].active,[data-scenario].active')].filter(visible).map(e=>e.textContent).join('；')].join('；').slice(0,1800),
    metrics:[text('filtered-summary'),text('viewport-summary'),text('comparison-summary'),text('dataset-status'),text('dataset-date')].join('；').slice(0,1800),
    detail:[text('node-detail'),text('detail')].join('；').slice(0,3500)
  };
};
