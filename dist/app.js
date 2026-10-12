const app = document.querySelector('#app');
const STORAGE_KEY = 'xw-phone-service-v1';
const initialState = {
  taotao: { step: 1, preset: '', budget: '', model: '', focus: '综合体验', condition: '可接受轻微使用痕迹', other: '', inspection: '', agreed: false },
  daipai: { step: 1, inspection: '', agreed: false }
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      taotao: { ...initialState.taotao, ...(saved?.taotao || {}) },
      daipai: { ...initialState.daipai, ...(saved?.daipai || {}) }
    };
  } catch { return structuredClone(initialState); }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function routeName() { return (location.hash.slice(1) || 'home').split('?')[0]; }
function go(route) { if (`#${route}` === location.hash) render(); else location.hash = route; }
function topAfterRender() { requestAnimationFrame(() => { window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); app.focus({ preventScroll: true }); }); }

const backButton = (route, label = '返回上一步') => `<button class="secondary-btn" type="button" data-route="${route}">${label}</button>`;
const steps = (active, labels) => `<div class="stepper" aria-label="服务步骤">${labels.map((x,i)=>`<div class="step ${i + 1 <= active ? 'active' : ''}">${i + 1}. ${x}</div>`).join('')}</div>`;
const fraudMini = `<div class="fraud-mini"><strong>防骗提醒：</strong>请只通过“小王混剪”官方主页主动联系本人。警惕陌生账号主动私信、冒充客服或催促转账；付款前请核实身份与收款信息。</div>`;
const paymentSection = `<div class="payment-section">
  <p class="payment-instruction"><strong>请先截图发送给小王，等待小王确认你的预算和购机需求可以代淘。确认可以代淘后，再扫描下方二维码支付20元代淘服务费。</strong></p>
  <div class="payment-grid" aria-label="收款二维码">
    <div class="payment-card"><button class="zoomable" type="button" data-image="./assets/payment-wechat.jpg" data-alt="微信支付收款二维码"><img src="./assets/payment-wechat.jpg" alt="小王混剪微信支付收款二维码" width="800" height="1088" decoding="async"></button><p>微信支付 · 点击查看大图</p></div>
    <div class="payment-card"><button class="zoomable" type="button" data-image="./assets/payment-alipay.png" data-alt="支付宝收款二维码"><img src="./assets/payment-alipay.png" alt="小王混剪支付宝收款二维码" width="1708" height="2560" decoding="async"></button><p>支付宝 · 点击查看大图</p></div>
  </div>
</div>`;
const inspectionWith = '需要小王帮忙验机';
const inspectionWithout = '不需要小王帮忙验机';

function inspectionSelector(selected, service) {
  const isDaipai = service === 'daipai';
  const radioName = `${service}Inspection`;
  const revealId = `${service}VideoRules`;
  const withCopy = isDaipai
    ? '机器成功拍下后，先寄送到小王处。小王进行基础外观及功能检查，不拆机，检查完成后再转寄给客户。顺丰运费到付，非偏远地区预计20元以内，实际以快递报价为准。预计4～5天送达，实际以物流情况为准。基础验机不能保证发现所有隐藏问题。'
    : '机器先寄给小王，进行外观及基本功能检查，不拆机。检查不代表能够发现所有隐藏问题。随后转寄客户，顺丰到付，非偏远地区运费通常预计20元以内，实际以快递报价为准。预计4至5天送达，仅供参考。';
  const withoutCopy = isDaipai
    ? '机器成功拍下后，直接寄送给客户。预计2～3天送达，实际以物流情况为准。建议收到机器后录制连续、未经剪辑的开箱验机视频；如发现机器存在问题，可以联系小王协助处理售后。'
    : '机器直接寄给客户，预计2至3天送达，仅供参考。收到后建议录制连续、未经剪辑的开箱验机视频，发现问题及时联系小王处理售后。';
  const specialCopy = isDaipai
    ? '如果多个客户的机器合并发货，即使选择了不需要验机，也可能需要先寄到小王处再转寄。由此产生的额外转寄运费由小王承担，并通知客户。'
    : '若多个客户的机器被合并发货，可能需要先寄到小王处再转寄。由此产生的额外转寄运费由小王承担，并提前通知客户。';

  return `<div class="card"><h3>请选择验机方式</h3><div class="option-list" style="margin-top:14px">
      <label class="choice-label"><input type="radio" name="${radioName}" value="${inspectionWith}" ${selected===inspectionWith?'checked':''}><span class="choice-ui"><span class="choice-letter">A</span><span class="option-copy"><strong>${inspectionWith}</strong><span>${withCopy}</span></span></span></label>
      <label class="choice-label"><input type="radio" name="${radioName}" value="${inspectionWithout}" ${selected===inspectionWithout?'checked':''}><span class="choice-ui"><span class="choice-letter">B</span><span class="option-copy"><strong>${inspectionWithout}</strong><span>${withoutCopy}</span></span></span></label>
    </div>
    <div class="form-reveal ${selected===inspectionWithout?'open':''}" id="${revealId}" aria-hidden="${selected===inspectionWithout?'false':'true'}"><div><div class="media-block"><button class="zoomable" type="button" data-image="./assets/video-evidence-rules.jpg" data-alt="视频举证规则"><img src="./assets/video-evidence-rules.jpg" alt="视频举证规则原图"></button><p class="media-caption">视频举证规则 · 点击图片查看大图</p></div></div></div>
    </div>
    <div class="notice warning"><strong>特殊情况：</strong>${specialCopy}</div>`;
}

function bindInspectionSelector({ service, model, agreementId, confirmId, errorId }) {
  document.querySelectorAll(`input[name="${service}Inspection"]`).forEach(input => input.addEventListener('change', e => {
    model.inspection = e.target.value;
    saveState();

    const showVideoRules = model.inspection === inspectionWithout;
    const videoRules = document.querySelector(`#${service}VideoRules`);
    videoRules?.classList.toggle('open', showVideoRules);
    videoRules?.setAttribute('aria-hidden', String(!showVideoRules));

    const agreement = document.querySelector(`#${agreementId}`);
    const confirmButton = document.querySelector(`#${confirmId}`);
    if (confirmButton) confirmButton.disabled = !model.inspection || !agreement?.checked;
    const error = document.querySelector(`#${errorId}`);
    if (error) error.textContent = '';
  }));
}

function home() {
  return `<section class="page">
    <div class="hero">
      <div class="hero-badge">服务流程公开 · 先确认再付款</div>
      <p class="eyebrow">欢迎来到小王混剪</p>
      <h1>二手手机<br>代淘服务中心</h1>
      <p class="lead">请选择您需要的服务。</p>
    </div>
    <div class="service-grid">
      <button class="service-card" type="button" data-route="taotao-1"><span class="icon">⌕</span><strong>我要找手机</strong><span>告诉我预算和需求，由小王协助寻找</span></button>
      <button class="service-card" type="button" data-route="daipai-1"><span class="icon">✓</span><strong>我已选好手机，需要代拍</strong><span>已在拍机堂选好指定机器</span></button>
      <button class="service-card" type="button" data-route="about"><span class="icon">i</span><strong>我想先了解一下</strong><span>查看服务、资质、流程与防骗指南</span></button>
    </div>
  </section>`;
}

const presets = [
  '200元预算 · 60帧手机（不限机型）',
  '400元预算 · 90帧手机（不限机型）',
  '1000元预算 · 120帧手机（不限机型）',
  '以上都不符合我的需求'
];

function taotao1() {
  const t = state.taotao;
  const custom = t.preset === presets[3];
  return `<section class="page">
    ${steps(1, ['购机需求','服务确认','确认单'])}
    <div class="section-head"><p class="eyebrow">我要找手机 · 第一步</p><h1>选择购机需求</h1><p>选择接近的需求，确认无误后再进入下一步。</p></div>
    <div class="option-list" id="presetList">
      ${presets.map((p,i)=>`<button class="option-card ${t.preset===p?'selected':''}" type="button" data-preset="${i}" aria-pressed="${t.preset===p?'true':'false'}"><span class="option-dot"></span><span class="option-copy"><strong>${p}</strong></span></button>`).join('')}
    </div>
    <div class="notice">帧率指《和平精英》手游目标帧率，实际表现取决于机型、游戏版本和设置，不保证所有机器都能达到对应帧率。</div>
    <div class="form-reveal ${custom?'open':''}" id="customForm" aria-hidden="${custom?'false':'true'}"><div>
      <div class="card"><h3>填写自定义需求</h3><div class="form-grid" style="margin-top:16px">
        <div class="field"><label for="budget">购机预算 <span class="required">*</span></label><input id="budget" name="budget" type="number" inputmode="numeric" min="1" placeholder="例如：800" value="${esc(t.budget)}"><p class="hint">请填写人民币预算金额。</p></div>
        <div class="field"><label for="model">想要的手机型号（选填）</label><input id="model" name="model" type="text" placeholder="例如：iPhone 12、小米 12" value="${esc(t.model)}"></div>
        <div class="field"><label for="focus">更注重哪方面</label><select id="focus" name="focus">${['游戏性能','拍照效果','续航能力','综合体验'].map(x=>`<option ${t.focus===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label for="condition">外观成色</label><select id="condition" name="condition">${['外观较新','可接受轻微使用痕迹','可接受磕碰但屏幕和后盖不能裂','成色无所谓能正常使用即可'].map(x=>`<option ${t.condition===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label for="other">其他要求（选填）</label><textarea id="other" name="other" placeholder="可填写容量、颜色、品牌偏好等">${esc(t.other)}</textarea></div>
      </div></div>
    </div></div>
    <p class="error-text" id="presetError" role="alert"></p>
    <div class="actions">${backButton('home','返回首页')}<button class="primary-btn" id="presetConfirm" type="button" ${t.preset?'':'disabled'}>确认选择</button></div>
  </section>`;
}

function taotao2() {
  const t = state.taotao;
  return `<section class="page">
    ${steps(2, ['购机需求','服务确认','确认单'])}
    <div class="section-head"><p class="eyebrow">我要找手机 · 第二步</p><h1>代淘服务确认</h1><p>请阅读收费、发货与验机说明。</p></div>
    <div class="card fee-card"><small>代淘服务费</small><strong>20元</strong></div>
    <div class="card"><h3>服务与退款规则</h3><ul class="rule-list">
      <li>客户先支付20元代淘服务费，小王收到后开始找机。</li><li>找到机器后向客户展示具体信息；客户确认满意并决定购买后，再支付全部手机货款。</li><li>如不满意推荐的机器，可以继续寻找，无需重复支付服务费。</li><li>如无法找到符合双方确认要求的机器，退还20元服务费。</li><li>如已找到符合双方约定要求的机器并完成约定的寻找服务，服务费原则上不退，法律另有规定的除外。</li><li>客户更改需求，应及时联系小王重新确认。</li>
    </ul></div>
    ${inspectionSelector(t.inspection, 'taotao')}
    <div class="card"><h3>付款与商品说明</h3><ul class="rule-list compact"><li>二手手机为非标准化商品，每台机器的价格、成色、配置、维修情况可能不同，购买前由客户确认具体机器信息。</li><li>所有机器不支持货到付款或分期付款。确认购买后需支付全部货款再发货。</li><li>小王自有库存现货的顺丰运费由小王承担。</li></ul></div>
    <label class="agreement"><input type="checkbox" id="taotaoAgree" ${t.agreed?'checked':''}><span>我已阅读并了解代淘服务规则</span></label>
    <p class="error-text" id="taotaoError" role="alert"></p>
    <div class="actions">${backButton('taotao-1')}<button class="primary-btn" id="taotaoConfirm" type="button" ${(!t.inspection||!t.agreed)?'disabled':''}>生成确认单</button></div>
  </section>`;
}

function taotao3() {
  const t = state.taotao;
  const demand = t.preset === presets[3] ? `预算 ${esc(t.budget)} 元${t.model?`，型号：${esc(t.model)}`:''}` : esc(t.preset);
  const details = t.preset === presets[3] ? `<div class="summary-row"><span>侧重方面</span><strong>${esc(t.focus)}</strong></div><div class="summary-row"><span>外观成色</span><strong>${esc(t.condition)}</strong></div>${t.other?`<div class="summary-row"><span>其他要求</span><strong>${esc(t.other)}</strong></div>`:''}` : '';
  return `<section class="page">
    ${steps(3, ['购机需求','服务确认','确认单'])}
    <div class="card receipt" id="receipt">
      <div class="receipt-head"><p class="receipt-kicker">小王混剪 · 服务确认单</p><h2>您的代淘需求已填写完成</h2></div>
      <div class="receipt-fee">本客户需要代淘服务<strong>20元代淘服务费</strong></div>
      <div class="summary-table"><div class="summary-row"><span>购机需求</span><strong>${demand}</strong></div>${details}<div class="summary-row"><span>验机方式</span><strong>${esc(t.inspection)}</strong></div></div>
      <div class="receipt-note"><strong>付款及发货规则：</strong>先支付20元服务费开始找机；确认具体机器后再支付全部手机货款。机器不支持货到付款或分期。发货时效仅供参考，实际以物流为准。</div>
      <p class="screenshot-callout">请将本页面截图发送给小王</p>
      ${fraudMini}
      ${paymentSection}
    </div>
    <div class="actions">${backButton('taotao-2','返回修改')}<button class="primary-btn" type="button" data-route="home">完成并返回首页</button></div>
  </section>`;
}

function daipai1() {
  return `<section class="page">
    ${steps(1, ['了解服务','代拍须知','确认单'])}
    <div class="section-head"><p class="eyebrow">指定机器代拍 · 第一步</p><h1>了解代拍服务</h1><p>适合已经在拍机堂选好指定机器的客户。</p></div>
    <div class="card fee-card"><small>代拍服务费</small><strong>20元</strong></div>
    <div class="card"><h3>服务范围</h3><ul class="rule-list"><li>客户自行在拍机堂选择机器，小王只负责协助购买指定机器，不负责寻找或推荐其他机器。</li><li>仅支持拍机堂平台，不支持其他竞拍或二手交易平台。</li><li>无需在网站上传机器图片，后续直接通过私信发送给小王。</li></ul></div>
    <div class="actions">${backButton('home','返回首页')}<button class="primary-btn" type="button" data-route="daipai-2">我已了解，继续</button></div>
  </section>`;
}

function daipai2() {
  const d = state.daipai;
  return `<section class="page">
    ${steps(2, ['了解服务','代拍须知','确认单'])}
    <div class="section-head"><p class="eyebrow">指定机器代拍 · 第二步</p><h1>代拍须知</h1><p>请在继续前完整阅读。</p></div>
    <div class="card"><ol class="rule-list"><li>二手手机库存实时变化，之前看中的机器可能已经售出、下架或价格变化。</li><li>拍机堂属于B2B二手数码交易平台，交易过程中可能产生相关费用。小王会在下单前提供最终成交报价，客户确认后再付款。</li><li>暗拍交易存在时间和竞价限制，不能保证一定成功拍下。</li></ol></div>
    <div class="card"><h3>暗拍参考场次</h3><div class="summary-table"><div class="summary-row"><span>第一场</span><strong>08:00—11:00</strong></div><div class="summary-row"><span>第二场</span><strong>12:00—18:00</strong></div><div class="summary-row"><span>第三场</span><strong>19:00—次日02:00</strong></div></div><p class="hint">非交易时段可能无法查询或操作，实际以平台情况为准。以上场次上线前需要核对最新规则。</p></div>
    <div class="card"><h3>拍单、退款与售后</h3><ul class="rule-list"><li>拍单前核对商品编号、型号、成色、已知问题及最终成交价格，客户确认后全款支付。</li><li><strong>方案一：</strong>指定机器已售出、下架或无法成功拍下，可全额退款，包括已支付的20元代拍服务费和手机货款。</li><li><strong>方案二：</strong>也可保留款项，重新选择机器继续代拍，无需再次支付20元服务费；更换机器后的价格差异需重新确认和结算。</li><li>成功购买后如有商品描述不符或功能异常，可联系小王协助处理售后。已成交订单的取消、退款按实际订单情况、双方约定及适用法律处理。</li></ul></div>
    ${inspectionSelector(d.inspection, 'daipai')}
    <label class="agreement"><input type="checkbox" id="daipaiAgree" ${d.agreed?'checked':''}><span>我已阅读并了解代拍服务规则</span></label>
    <p class="error-text" id="daipaiError" role="alert"></p>
    <div class="actions">${backButton('daipai-1')}<button class="primary-btn" id="daipaiConfirm" type="button" ${(!d.inspection||!d.agreed)?'disabled':''}>生成确认单</button></div>
  </section>`;
}

function daipai3() {
  const d = state.daipai;
  const shipping = d.inspection === inspectionWith
    ? '成功拍下后先寄小王处进行基础验机，再顺丰到付转寄客户；时效以实际物流为准'
    : '成功拍下后直接寄送客户；建议录制连续、未经剪辑的开箱验机视频';
  return `<section class="page">
    ${steps(3, ['了解服务','代拍须知','确认单'])}
    <div class="card receipt">
      <div class="receipt-head"><p class="receipt-kicker">小王混剪 · 服务确认单</p><h2>代拍申请已填写完成</h2></div>
      <div class="receipt-fee">本客户需要代拍服务<strong>20元代拍服务费</strong></div>
      <div class="summary-table"><div class="summary-row"><span>验机方式</span><strong>${esc(d.inspection)}</strong></div><div class="summary-row"><span>付款及发货</span><strong>核对指定机器与最终成交报价，客户确认后全款支付；${shipping}</strong></div><div class="summary-row"><span>无法成交</span><strong>可全额退款（含服务费和货款），或保留款项重新选机继续代拍</strong></div></div>
      <div class="notice warning" style="margin-bottom:0"><strong>当前仅为申请确认：</strong>机器尚未拍下，也尚未实际成交。</div>
      ${fraudMini}
      <div class="receipt-note">机器截图尽量包含商品编号、型号和页面价格。</div>
      <p class="screenshot-callout">请将本页面截图，以及您在拍机堂选中的机器截图，一起私信发送给小王。</p>
      ${paymentSection}
    </div>
    <div class="actions">${backButton('daipai-2','返回修改')}<button class="primary-btn" type="button" data-route="home">完成并返回首页</button></div>
  </section>`;
}

function about() {
  return `<section class="page">
    <div class="hero" style="padding-top:20px"><p class="eyebrow">先了解，再决定</p><h1>关于小王的<br>代淘与代拍服务</h1><p class="lead">把流程、费用和风险讲清楚，再开始服务。</p></div>
    <nav class="intro-nav" aria-label="本页目录"><button type="button" data-scroll-target="intro-service">服务</button><button type="button" data-scroll-target="intro-license">营业执照</button><button type="button" data-scroll-target="intro-reality">真人内容</button><button type="button" data-scroll-target="intro-safety">防骗指南</button></nav>
    <section class="card info-section" id="intro-service"><h2>两种服务，一次说清</h2><div class="trust-points"><div class="trust-point"><b>代淘</b><span>告诉小王预算与需求，由小王协助寻找合适的二手手机；服务费20元。</span></div><div class="trust-point"><b>代拍</b><span>您已在拍机堂选好指定机器，小王协助购买；服务费20元。</span></div></div></section>
    <section class="card info-section"><h2>服务流程及收费</h2><div class="process-grid"><div class="process-item"><span class="process-num">1</span><div><h3>确认需求</h3><p>选择代淘或代拍，阅读对应规则。</p></div></div><div class="process-item"><span class="process-num">2</span><div><h3>支付服务费</h3><p>双方确认后支付20元服务费，网站本身不收款。</p></div></div><div class="process-item"><span class="process-num">3</span><div><h3>确认具体机器</h3><p>核对机器信息和最终价格，确认购买后再支付全部手机货款。</p></div></div><div class="process-item"><span class="process-num">4</span><div><h3>发货与售后</h3><p>按所选方式发货；遇到问题及时联系小王协助处理。</p></div></div></div></section>
    <section class="card info-section" id="intro-license"><h2>营业执照</h2><p class="hint">以下为用户提供的真实原图，登记信息未作修改。</p><div class="media-block"><button class="zoomable" type="button" data-image="./assets/business-license.jpg" data-alt="营业执照原图"><img src="./assets/business-license.jpg" alt="小王提供的营业执照原图"></button><p class="media-caption">点击图片查看大图</p></div></section>
    <section class="card info-section story-card" id="intro-reality"><div class="story-layout"><div class="story-media portrait-media"><button class="zoomable" type="button" data-image="./assets/xiaowang-portrait.jpg" data-alt="小王混剪个人形象照"><img class="portrait-photo" src="./assets/xiaowang-portrait.jpg" alt="小王混剪穿黑色西装竖起大拇指的个人形象照" width="960" height="1280" loading="lazy" decoding="async"></button><p class="media-caption">小王混剪个人形象照 · 点击查看大图</p></div><div class="story-copy"><p class="eyebrow">真人内容</p><h2>持续真人出镜，真实分享二手数码</h2><p>我是小王混剪，长期分享二手手机和数码产品相关内容，并通过真人出镜视频、直播与粉丝交流。您可以通过我的日常作品和直播了解我，再决定是否选择代淘或代拍服务。</p></div></div></section>
    <section class="card info-section story-card"><div class="story-layout collaboration-layout"><div class="story-media collaboration-media"><button class="zoomable" type="button" data-image="./assets/xiaowang-yunyun-collaboration.jpg" data-alt="小王混剪与芸姐合作视频截图"><img class="collaboration-photo" src="./assets/xiaowang-yunyun-collaboration.jpg" alt="发布账号为代淘头子芸芸并标注小王混剪的合作视频截图" width="590" height="1280" loading="lazy" decoding="async"></button><p class="media-caption">真实合作视频截图 · 点击查看大图</p></div><div class="story-copy"><p class="eyebrow">合作内容</p><h2>与芸姐合作出镜，真实视频可查</h2><p>小王混剪曾与运营芸姐共同拍摄二手数码相关视频。您可以通过公开发布的真人出镜作品，进一步了解小王的实际工作和日常内容。</p><div class="story-note"><h3>想查看我们一起拍摄的视频？</h3><p>您可以前往抖音或快手，搜索『小王混剪』及『代淘头子芸芸』相关账号，查看公开发布的合作视频。</p></div><p class="hint">真实合作视频可作为了解小王的参考，不代表平台官方担保，也不能单独作为交易安全保证。</p></div></div></section>
    <section class="card info-section" id="intro-safety"><h2>如何识别二手手机交易骗局</h2><ul class="rule-list"><li>查看账号是否长期发布二手手机和数码内容。</li><li>查看主播是否有持续真人出镜的视频或直播。</li><li>核实对方声称的平台合作关系。</li><li>查看是否有真实的粉丝交流群。</li><li>核对收款身份、订单信息和交易凭证。</li><li>警惕异常低价、催促转账、拒绝说明售后规则等情况。</li><li>露脸、粉丝群和营业执照都不能单独保证交易安全。</li></ul></section>
    <div class="fraud-alert"><h3>重要防骗提醒</h3><p>在直播间或评论区，可能有人主动关注您、私信您，或者要求您回复私信，冒充小王或客服。请勿轻信陌生账号，更不要随意转账。请主动通过小王混剪官方主页联系本人，并在付款前核实身份及收款信息。</p></div>
    <section class="card info-section"><h2>了解完成，选择服务</h2><div class="cta-pair"><button class="primary-btn" type="button" data-route="taotao-1">我要找手机</button><button class="secondary-btn" type="button" data-route="daipai-1">我已选好，需要代拍</button></div></section>
  </section>`;
}

const routes = { home, 'taotao-1': taotao1, 'taotao-2': taotao2, 'taotao-3': taotao3, 'daipai-1': daipai1, 'daipai-2': daipai2, 'daipai-3': daipai3, about };

function render() {
  const route = routeName();
  if (!routes[route]) return go('home');
  if (route === 'daipai-3' && (!state.daipai.inspection || !state.daipai.agreed)) return go('daipai-2');
  app.innerHTML = routes[route]();
  bindPage(route);
  topAfterRender();
}

function bindPage(route) {
  if (route === 'taotao-1') {
    document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
      const value = presets[Number(btn.dataset.preset)];
      state.taotao.preset = value; saveState();
      document.querySelectorAll('[data-preset]').forEach(option => {
        const selected = option === btn;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
      const showCustom = value === presets[3];
      const customForm = document.querySelector('#customForm');
      customForm?.classList.toggle('open', showCustom);
      customForm?.setAttribute('aria-hidden', String(!showCustom));
      const confirmButton = document.querySelector('#presetConfirm');
      if (confirmButton) confirmButton.disabled = false;
      const error = document.querySelector('#presetError');
      if (error) error.textContent = '';
    }));
    ['budget','model','focus','condition','other'].forEach(id => document.querySelector(`#${id}`)?.addEventListener('input', e => { state.taotao[id] = e.target.value; saveState(); }));
    document.querySelector('#presetConfirm')?.addEventListener('click', () => {
      if (!state.taotao.preset) { document.querySelector('#presetError').textContent = '请先选择一项购机需求。'; return; }
      if (state.taotao.preset === presets[3] && (!state.taotao.budget || Number(state.taotao.budget) <= 0)) { document.querySelector('#presetError').textContent = '请填写有效的购机预算。'; document.querySelector('#budget').focus(); return; }
      state.taotao.step = 2; saveState(); go('taotao-2');
    });
  }
  if (route === 'taotao-2') {
    bindInspectionSelector({ service: 'taotao', model: state.taotao, agreementId: 'taotaoAgree', confirmId: 'taotaoConfirm', errorId: 'taotaoError' });
    document.querySelector('#taotaoAgree')?.addEventListener('change', e => { state.taotao.agreed = e.target.checked; saveState(); document.querySelector('#taotaoConfirm').disabled = !state.taotao.inspection || !state.taotao.agreed; });
    document.querySelector('#taotaoConfirm')?.addEventListener('click', () => {
      if (!state.taotao.inspection || !state.taotao.agreed) { document.querySelector('#taotaoError').textContent = '请选择验机方式，并勾选已阅读服务规则。'; return; }
      state.taotao.step = 3; saveState(); go('taotao-3');
    });
  }
  if (route === 'daipai-2') {
    bindInspectionSelector({ service: 'daipai', model: state.daipai, agreementId: 'daipaiAgree', confirmId: 'daipaiConfirm', errorId: 'daipaiError' });
    document.querySelector('#daipaiAgree')?.addEventListener('change', e => { state.daipai.agreed = e.target.checked; saveState(); document.querySelector('#daipaiConfirm').disabled = !state.daipai.inspection || !state.daipai.agreed; });
    document.querySelector('#daipaiConfirm')?.addEventListener('click', () => {
      if (!state.daipai.inspection || !state.daipai.agreed) { document.querySelector('#daipaiError').textContent = '请选择验机方式，并勾选已阅读服务规则。'; return; }
      state.daipai.step = 3; saveState(); go('daipai-3');
    });
  }
}

document.addEventListener('click', e => {
  const scrollTarget = e.target.closest('[data-scroll-target]');
  if (scrollTarget) {
    e.preventDefault();
    const section = document.querySelector(`#${scrollTarget.dataset.scrollTarget}`);
    section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const routeTarget = e.target.closest('[data-route]');
  if (routeTarget) { e.preventDefault(); go(routeTarget.dataset.route); return; }
  const imageTarget = e.target.closest('[data-image]');
  if (imageTarget) openImage(imageTarget.dataset.image, imageTarget.dataset.alt);
});

const modal = document.querySelector('#imageModal');
const modalImage = document.querySelector('#modalImage');
function openImage(src, alt) { modalImage.src = src; modalImage.alt = alt || '查看大图'; modal.hidden = false; document.body.style.overflow = 'hidden'; document.querySelector('#modalClose').focus(); }
function closeImage() { modal.hidden = true; modalImage.src = ''; document.body.style.overflow = ''; }
document.querySelector('#modalClose').addEventListener('click', closeImage);
modal.addEventListener('click', e => { if (e.target === modal) closeImage(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeImage(); });
window.addEventListener('hashchange', render);
render();
