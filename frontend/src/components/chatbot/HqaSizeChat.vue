<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHqaChatStore } from '../../stores/hqaChat'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'

const props = defineProps({
  // true: hiển thị cố định trong trang (trang /tu-van-size); false: khung nổi ở góc phải
  embedded: { type: Boolean, default: false },
})

const chat = useHqaChatStore()
const shop = useHqaShopStore()
const route = useRoute()
const router = useRouter()

const draft = ref('')
const bodyEl = ref(null)
const inputEl = ref(null)

const visible = computed(() => props.embedded || chat.open)
const lastMessage = computed(() => chat.messages[chat.messages.length - 1] || null)
// Gợi ý trả lời nhanh chỉ hiện dưới tin nhắn cuối của trợ lý
const quickReplies = computed(() => {
  const m = lastMessage.value
  return m && m.role === 'bot' && !chat.loading ? m.quickReplies || [] : []
})

const AVAILABILITY_TEXT = { in: 'Còn hàng', low: 'Sắp hết hàng', out: 'Hết hàng' }
const FORM_FIELDS = [
  { key: 'height', label: 'Chiều cao', unit: 'cm', min: 100, max: 230, step: 1 },
  { key: 'weight', label: 'Cân nặng', unit: 'kg', min: 20, max: 250, step: 0.1 },
  { key: 'chest', label: 'Vòng ngực', unit: 'cm', min: 50, max: 160, step: 1 },
  { key: 'waist', label: 'Vòng eo', unit: 'cm', min: 40, max: 160, step: 1 },
  { key: 'hip', label: 'Vòng hông', unit: 'cm', min: 50, max: 170, step: 1 },
]
const LABELS = Object.fromEntries(FORM_FIELDS.map((f) => [f.key, f.label.toLowerCase()]))

// Danh sách sản phẩm cho ô chọn trong biểu mẫu
const productOptions = computed(() => {
  const list = shop.products.map((p) => ({ id: p.id, name: p.name }))
  // luôn có sản phẩm đang tư vấn trong danh sách, kể cả khi danh mục chưa tải xong
  for (const m of chat.messages) {
    for (const c of m.cards || []) {
      const p = c.type === 'form' ? c.prefill?.product : null
      if (p && !list.some((x) => x.id === p.id)) list.push({ id: p.id, name: p.name })
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
})

onMounted(() => {
  chat.hydrate()
  // Danh sách sản phẩm cho ô chọn trong biểu mẫu: nạp nếu store chưa có
  if (!shop.products.length && typeof shop.fetchCatalog === 'function') shop.fetchCatalog().catch(() => {})
})

// Chuyển **đậm** và xuống dòng sang HTML. Đã thoát ký tự đặc biệt trước nên an toàn.
function formatText(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

// Cuộn tới tin mới nhất. Nếu câu trả lời của trợ lý dài hơn khung nhìn thì cuộn về ĐẦU câu trả lời
// để khách đọc từ phần mở đầu, thay vì bị đẩy xuống cuối.
function scrollToBottom() {
  nextTick(() => {
    const el = bodyEl.value
    if (!el) return
    const rows = el.querySelectorAll('.chat-row')
    const last = rows[rows.length - 1]
    if (last && last.classList.contains('bot') && !chat.loading && last.offsetHeight > el.clientHeight * 0.8) {
      el.scrollTop = Math.max(0, last.offsetTop - 8)
    } else {
      el.scrollTop = el.scrollHeight
    }
  })
}
watch(() => [chat.messages.length, chat.loading], scrollToBottom)
watch(visible, (v) => {
  if (!v) return
  scrollToBottom()
  nextTick(() => inputEl.value?.focus())
})

function autoGrow() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 110)}px`
}

async function submit(text) {
  const value = String(text ?? draft.value).trim()
  if (!value || chat.loading) return
  draft.value = ''
  nextTick(autoGrow)
  await chat.send(value)
  nextTick(() => inputEl.value?.focus())
}

function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function onEscape() {
  if (!props.embedded) chat.close()
}

function mismatchText(i) {
  return `${i.label.toLowerCase()} ${i.side === 'above' ? 'lớn hơn' : 'nhỏ hơn'} khoảng ${i.min}–${i.max} ${i.unit} (${i.diff} ${i.unit})`
}
const fromProfile = (c, key) => (c.fromProfile || []).includes(key)

// ---------- Biểu mẫu nhập số đo thủ công ----------
const forms = reactive({}) // theo id tin nhắn: { productId, values, errors, submitting }
function makeForm(card) {
  const pre = card.prefill || {}
  return {
    productId: pre.productId || '',
    values: Object.fromEntries(FORM_FIELDS.map((f) => [f.key, pre.measurements?.[f.key] ?? ''])),
    errors: {},
    submitting: false,
  }
}
// Tạo state cho mỗi biểu mẫu mới (không tạo trong lúc render)
function ensureForms() {
  for (const m of chat.messages) {
    for (const c of m.cards || []) if (c.type === 'form' && !forms[m.id]) forms[m.id] = makeForm(c)
  }
}
watch(() => chat.messages.length, ensureForms, { immediate: true, flush: 'sync' })
const formFor = (m) => forms[m.id] || makeForm({})

function validateForm(f) {
  const errors = {}
  if (!f.productId) errors.productId = 'Vui lòng chọn sản phẩm.'
  for (const field of FORM_FIELDS) {
    const raw = f.values[field.key]
    if (raw === '' || raw === null || raw === undefined) continue // không bắt buộc 5 ô
    const n = Number(raw)
    if (!Number.isFinite(n) || n < field.min || n > field.max) errors[field.key] = `Phải từ ${field.min} đến ${field.max} ${field.unit}.`
  }
  return errors
}

async function submitForm(m, card) {
  const f = formFor(m)
  f.errors = validateForm(f)
  if (Object.keys(f.errors).length) return
  f.submitting = true
  const measurements = Object.fromEntries(FORM_FIELDS.filter((x) => f.values[x.key] !== '' && f.values[x.key] != null).map((x) => [x.key, Number(f.values[x.key])]))
  const result = await chat.submitForm(m.id, { productId: f.productId, measurements })
  f.submitting = false
  if (!result.ok) f.errors = result.errors || {}
}

async function onAction(action) {
  if (action.type !== 'select-size') return
  const target = `/san-pham/${action.productId}`
  if (route.path !== target) await router.push(target)
  chat.chooseSize(action)
  // Trên điện thoại khung chat phủ kín màn hình: thu lại để khách thấy size vừa chọn
  if (!props.embedded && window.matchMedia('(max-width: 640px)').matches) chat.close()
}

const quickLabel = (q) => (typeof q === 'object' ? q.label : q)

function pickProduct(p) {
  submit(`Mình muốn mua ${p.name}`)
}

function hasUnderstood(m) {
  const e = m.extracted
  return !!e && (e.measurements?.length || e.product || e.size || e.color || e.fromProfile?.length)
}
function understoodChips(m) {
  const e = m.extracted
  const chips = (e.measurements || []).map((x) => `${x.label}: ${x.value} ${x.unit}`)
  if (e.product) chips.push(`Sản phẩm: ${e.product.name}`)
  if (e.size) chips.push(`Size hỏi: ${e.size}`)
  if (e.color) chips.push(`Màu: ${e.color}`)
  if (e.fromProfile?.length) chips.push('Số đo từ hồ sơ cá nhân')
  return chips
}
</script>

<template>
  <section
    v-show="visible"
    class="hqa-chat"
    :class="{ embedded }"
    role="dialog"
    aria-label="Trợ lý tư vấn size HQA"
    @keydown.esc="onEscape"
  >
    <header class="chat-head">
      <div class="chat-avatar" aria-hidden="true">✧</div>
      <div class="chat-title">
        <strong>Trợ lý tư vấn size</strong>
        <span><i class="chat-dot" aria-hidden="true"></i>Trò chuyện bằng tiếng Việt</span>
      </div>
      <button type="button" class="chat-icon-btn" title="Bắt đầu lại" aria-label="Bắt đầu cuộc trò chuyện mới" @click="chat.reset()">↺</button>
      <button v-if="!embedded" type="button" class="chat-icon-btn" title="Đóng" aria-label="Đóng khung chat" @click="chat.close()">×</button>
    </header>

    <div ref="bodyEl" class="chat-body" role="log" aria-live="polite" aria-relevant="additions">
      <div v-for="m in chat.messages" :key="m.id" class="chat-row" :class="m.role">
        <div class="chat-stack">
          <div v-if="m.role === 'bot' && hasUnderstood(m)" class="chat-understood" aria-label="Thông tin trợ lý đã nhận diện">
            <span class="chat-understood-title">Mình hiểu:</span>
            <span v-for="chip in understoodChips(m)" :key="chip" class="chat-chip">{{ chip }}</span>
          </div>

          <div class="chat-bubble" :class="{ error: m.error }" v-html="formatText(m.text)"></div>
          <p v-if="m.techNote" class="chat-tech" role="note">⚙ Chi tiết kỹ thuật (chỉ hiện khi phát triển): {{ m.techNote }}</p>

          <template v-for="(c, i) in m.cards || []" :key="i">
            <!-- Một sản phẩm -->
            <div v-if="c.type === 'product'" class="chat-product">
              <img :src="c.product.image" :alt="c.product.name" loading="lazy" />
              <div class="chat-product-info">
                <strong>{{ c.product.name }}</strong>
                <span>{{ money(c.product.price) }}<s v-if="c.product.oldPrice > c.product.price"> {{ money(c.product.oldPrice) }}</s></span>
                <router-link :to="c.product.url" @click="!embedded && chat.close()">Xem sản phẩm ›</router-link>
              </div>
            </div>

            <!-- Nhiều sản phẩm để khách chọn -->
            <div v-else-if="c.type === 'products'" class="chat-products">
              <button v-for="p in c.items" :key="p.id" type="button" class="chat-product pick" @click="pickProduct(p)">
                <img :src="p.image" :alt="p.name" loading="lazy" />
                <div class="chat-product-info">
                  <strong>{{ p.name }}</strong>
                  <span>{{ money(p.price) }}</span>
                  <em>Chọn sản phẩm này</em>
                </div>
              </button>
            </div>

            <!-- Kết quả tư vấn -->
            <div v-else-if="c.type === 'advice' && c.status === 'OK'" class="chat-advice">
              <div v-if="c.product" class="adv-product"><img :src="c.product.image" :alt="c.product.name" loading="lazy" /><span>{{ c.product.name }}</span></div>
              <div class="adv-top">
                <div>
                  <small>Size đề xuất</small>
                  <b class="adv-size">{{ c.size }}</b>
                </div>
                <div class="adv-tags">
                  <span class="adv-badge" :class="c.complete ? 'is-high' : ''">{{ c.complete ? 'Khớp đủ 5 số đo' : 'Khớp các số đo đã cung cấp' }}</span>
                  <span v-if="c.availability && AVAILABILITY_TEXT[c.availability.status]" class="adv-stock" :class="`is-${c.availability.status}`">{{ AVAILABILITY_TEXT[c.availability.status] }}</span>
                </div>
              </div>
              <div class="adv-table-wrap">
                <table class="adv-table">
                  <thead>
                    <tr><th scope="col">Số đo</th><th scope="col">Của bạn</th><th scope="col">Size {{ c.size }}</th><th scope="col">Kết quả</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="e in c.evidence" :key="e.key">
                      <th scope="row">{{ e.label }}<small v-if="fromProfile(c, e.key)" class="adv-src"> · hồ sơ</small></th>
                      <td>{{ e.value }} {{ e.unit }}</td>
                      <td>{{ e.min }}–{{ e.max }}</td>
                      <td class="ok">✓ Vừa</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!c.complete" class="adv-alt">Gợi ý chỉ dựa trên số đo hiện có; chưa xác nhận được các số đo còn thiếu.</p>
              <p v-if="c.chosenBy === 'larger'" class="adv-alt">Số đo của bạn cùng nằm trong các size {{ c.matched.join(', ') }}, ưu tiên size lớn hơn để thoải mái.</p>
              <p v-if="c.availability?.status === 'out'" class="adv-alt">Size này đang hết hàng. Mình không tự đổi sang size khác vì có thể không vừa.</p>
              <div v-if="c.actions?.length" class="adv-actions">
                <button v-for="a in c.actions" :key="a.label" type="button" class="chat-primary" @click="onAction(a)">{{ a.label }}</button>
              </div>
            </div>

            <!-- Nhiều size cùng phù hợp với số đo hiện tại: không tự chốt size. -->
            <div v-else-if="c.type === 'advice' && c.status === 'AMBIGUOUS'" class="chat-advice">
              <strong class="chart-title">Cần thêm thông tin để chọn chính xác</strong>
              <p>Các size còn phù hợp theo bảng size shop: <strong>{{ c.candidates.join(', ') }}</strong>.</p>
              <p class="adv-alt">Bạn có thể cung cấp thêm số đo; trợ lý sẽ không chọn ngẫu nhiên.</p>
            </div>

            <!-- Chưa có size thỏa các số đo đã cung cấp -->
            <div v-else-if="c.type === 'advice' && c.status === 'NO_MATCH'" class="chat-advice">
              <div v-if="c.product" class="adv-product"><img :src="c.product.image" :alt="c.product.name" loading="lazy" /><span>{{ c.product.name }}</span></div>
              <div class="adv-top">
                <div><small>Kết quả</small><b class="adv-size none">Chưa tìm được size phù hợp với số đo của bạn</b></div>
              </div>
              <ul class="adv-mismatch">
                <li v-for="m in c.mismatches" :key="m.size"><strong>Size {{ m.size }}:</strong> {{ m.issues.map(mismatchText).join('; ') }}</li>
              </ul>
              <p class="adv-alt">Bạn có thể liên hệ chăm sóc khách hàng của HQA hoặc xem sản phẩm khác.</p>
            </div>

            <!-- Biểu mẫu nhập số đo thủ công -->
            <form v-else-if="c.type === 'form'" class="chat-form" novalidate @submit.prevent="submitForm(m, c)">
              <label class="cf-row">
                <span>Sản phẩm</span>
                <select v-model="formFor(m).productId" :disabled="m.formDone || formFor(m).submitting" :aria-invalid="!!formFor(m).errors.productId">
                  <option value="">— Chọn sản phẩm —</option>
                  <option v-for="p in productOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <em v-if="formFor(m).errors.productId" class="cf-error" role="alert">{{ formFor(m).errors.productId }}</em>
              </label>
              <div class="cf-grid">
                <label v-for="f in FORM_FIELDS" :key="f.key" class="cf-row">
                  <span>{{ f.label }} ({{ f.unit }})</span>
                  <input v-model="formFor(m).values[f.key]" type="number" inputmode="decimal" :min="f.min" :max="f.max" :step="f.step" :disabled="m.formDone || formFor(m).submitting" :aria-invalid="!!formFor(m).errors[f.key]" />
                  <em v-if="formFor(m).errors[f.key]" class="cf-error" role="alert">{{ formFor(m).errors[f.key] }}</em>
                </label>
              </div>
              <em v-if="formFor(m).errors._form" class="cf-error" role="alert">{{ formFor(m).errors._form }}</em>
              <button type="submit" class="chat-primary" :disabled="m.formDone || formFor(m).submitting">{{ m.formDone ? 'Đã gửi' : formFor(m).submitting ? 'Đang tư vấn...' : 'Tư vấn size' }}</button>
              <small class="cf-note">Chỉ điền những số đo bạn có, các ô khác được để trống. Hệ thống có thể bổ sung số đo đã lưu trong hồ sơ khách hàng. Thông tin nhập tại đây không tự lưu vào hồ sơ.</small>
            </form>

            <!-- Bảng size -->
            <div v-else-if="c.type === 'chart'" class="chat-advice">
              <strong class="chart-title">{{ c.title }}</strong>
              <div class="adv-table-wrap">
                <table class="adv-table">
                  <thead>
                    <tr><th scope="col">Size</th><th scope="col">Ngực</th><th scope="col">Eo</th><th scope="col">Hông</th><th scope="col">Cao</th><th scope="col">Nặng</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in c.rows" :key="r.size">
                      <th scope="row">{{ r.size }}</th><td>{{ r.chest }}</td><td>{{ r.waist }}</td><td>{{ r.hip }}</td><td>{{ r.height }}</td><td>{{ r.weight }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Tồn kho theo size và màu -->
            <div v-else-if="c.type === 'stock'" class="chat-advice">
              <strong class="chart-title">Tồn kho · {{ c.product.name }}</strong>
              <div class="adv-table-wrap">
                <table class="adv-table">
                  <thead>
                    <tr><th scope="col">Màu \ Size</th><th v-for="s in c.sizes" :key="s" scope="col">{{ s }}</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="color in c.colors" :key="color">
                      <th scope="row">{{ color }}</th>
                      <td v-for="s in c.sizes" :key="s" :class="(c.cells[s]?.[color] || 0) > 0 ? 'ok' : 'off'">{{ (c.cells[s]?.[color] || 0) > 0 ? c.cells[s][color] : 'Hết' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>

          <button v-if="m.error && m.retryText" type="button" class="chat-retry" :disabled="chat.loading" @click="submit(m.retryText)">Gửi lại</button>
        </div>
      </div>

      <div v-if="chat.loading" class="chat-row bot" aria-label="Trợ lý đang trả lời">
        <div class="chat-stack"><div class="chat-bubble typing"><i></i><i></i><i></i></div></div>
      </div>
    </div>

    <div v-if="quickReplies.length" class="chat-quick" aria-label="Gợi ý trả lời nhanh">
      <button v-for="q in quickReplies" :key="quickLabel(q)" type="button" @click="chat.sendQuick(q)">{{ quickLabel(q) }}</button>
    </div>

    <form class="chat-input" @submit.prevent="submit()">
      <textarea
        ref="inputEl"
        v-model="draft"
        rows="1"
        maxlength="500"
        placeholder="Nhập tin nhắn của bạn..."
        aria-label="Nhập tin nhắn"
        @input="autoGrow"
        @keydown="onKeydown"
      ></textarea>
      <button type="submit" class="chat-send" :disabled="!draft.trim() || chat.loading" aria-label="Gửi tin nhắn">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 11.5 21 3l-8.5 18-2-7.5L3 11.5Z" fill="currentColor" /></svg>
      </button>
    </form>
    <p class="chat-note">Gợi ý dựa trên bảng size của HQA, chỉ mang tính tham khảo.</p>
  </section>
</template>

<style scoped>
.hqa-chat {
  --rose: #a65770;
  --rose-soft: #fbf1f4;
  --rose-line: #f0dfe3;
  --ink: #5a4a42;
  position: fixed;
  right: 28px;
  bottom: 24px;
  z-index: 90;
  width: min(396px, calc(100vw - 24px));
  height: min(640px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--rose-line);
  border-radius: 20px;
  box-shadow: 0 18px 50px #5a4a4238, 0 2px 8px #5a4a4224;
  overflow: hidden;
  color: var(--ink);
  font-size: 14px;
  animation: chat-pop 0.22s ease-out;
}
.hqa-chat.embedded {
  position: relative;
  right: auto;
  bottom: auto;
  z-index: 1;
  width: 100%;
  max-width: 720px;
  height: min(680px, calc(100vh - 220px));
  min-height: 520px;
  margin: 0 auto;
  animation: none;
}

@keyframes chat-pop {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

/* ---------- Đầu khung ---------- */
.chat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 14px 16px;
  color: #fff;
  background: linear-gradient(135deg, #b9677f, #a65770);
}
.chat-avatar {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #ffffff2e;
  font-size: 18px;
}
.chat-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.chat-title strong { font-size: 15px; font-weight: 650; }
.chat-title span { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.9; }
.chat-dot { width: 7px; height: 7px; border-radius: 50%; background: #8be0a4; }
.chat-icon-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.chat-icon-btn:hover { background: #ffffff2e; }
.chat-icon-btn:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }

/* ---------- Nội dung ---------- */
.chat-body {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px 8px;
  background: #fcf7f6;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
}
.chat-row { display: flex; }
.chat-row.user { justify-content: flex-end; }
.chat-stack { display: flex; flex-direction: column; gap: 8px; max-width: 88%; min-width: 0; }
.chat-row.user .chat-stack { align-items: flex-end; }

.chat-bubble {
  padding: 10px 13px;
  border-radius: 16px;
  line-height: 1.55;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.chat-row.bot .chat-bubble {
  background: #fff;
  border: 1px solid var(--rose-line);
  border-top-left-radius: 5px;
}
.chat-row.user .chat-bubble {
  background: linear-gradient(135deg, #b9677f, #a65770);
  color: #fff;
  border-top-right-radius: 5px;
}
.chat-tech { margin: 0; padding: 7px 10px; border-radius: 10px; background: #f3f0ff; border: 1px dashed #c9bfef; color: #5b4b9a; font-size: 11.5px; line-height: 1.45; word-break: break-word; }
.chat-bubble.error { background: #fff4f2; border-color: #f3c9c2; color: #9a4a3d; }
.chat-bubble :deep(strong) { font-weight: 650; }

.chat-bubble.typing { display: flex; gap: 5px; padding: 14px 16px; }
.chat-bubble.typing i {
  width: 7px; height: 7px; border-radius: 50%; background: #c9a3af;
  animation: chat-bounce 1s infinite ease-in-out;
}
.chat-bubble.typing i:nth-child(2) { animation-delay: 0.15s; }
.chat-bubble.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes chat-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-5px); opacity: 1; }
}

.chat-understood { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.chat-understood-title { font-size: 11px; color: #9a8088; }
.chat-chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--rose-soft);
  border: 1px solid var(--rose-line);
  color: var(--rose);
  font-size: 11.5px;
}

/* ---------- Thẻ sản phẩm ---------- */
.chat-products { display: flex; flex-direction: column; gap: 8px; }
.chat-product {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 8px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: #fff;
  border: 1px solid var(--rose-line);
  border-radius: 14px;
}
.chat-product.pick { cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.chat-product.pick:hover, .chat-product.pick:focus-visible { border-color: var(--rose); box-shadow: 0 4px 14px #a6577022; outline: none; }
.chat-product img { width: 52px; height: 65px; flex: none; object-fit: cover; border-radius: 8px; background: var(--rose-soft); }
.chat-product-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; }
.chat-product-info strong { font-weight: 600; line-height: 1.3; }
.chat-product-info span { color: var(--rose); font-weight: 600; }
.chat-product-info span s { color: #a99aa0; font-weight: 400; margin-left: 4px; }
.chat-product-info em { font-style: normal; font-size: 12px; color: #8a6a74; }
.chat-product-info a { font-size: 12px; color: var(--rose); text-decoration: none; }
.chat-product-info a:hover { text-decoration: underline; }

/* ---------- Thẻ kết quả / bảng ---------- */
.chat-advice { background: #fff; border: 1px solid var(--rose-line); border-radius: 14px; padding: 12px; }
.adv-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.adv-top small { display: block; font-size: 12px; color: #9a8088; }
.adv-size { display: block; font-size: 34px; line-height: 1.1; font-weight: 750; color: var(--rose); font-family: 'Playfair Display', Georgia, serif; }
.adv-tags { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.adv-badge, .adv-stock {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--rose-soft);
  color: var(--rose);
}
.adv-badge.is-high { background: #e8f5ec; color: #2d7a46; }
.adv-badge.is-low { background: #fdf1e3; color: #a8651a; }
.adv-stock.is-in { background: #e8f5ec; color: #2d7a46; }
.adv-stock.is-low { background: #fdf1e3; color: #a8651a; }
.adv-stock.is-out { background: #fdecea; color: #b0463a; }

.adv-table-wrap { margin-top: 10px; overflow-x: auto; }
.adv-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--rose-line); border-radius: 10px; overflow: hidden; font-size: 12.5px; }
.adv-table th, .adv-table td { padding: 6px 8px; text-align: center; border-bottom: 1px solid #f4eaed; white-space: nowrap; }
.adv-table thead th { background: var(--rose-soft); color: var(--rose); font-weight: 600; }
.adv-table tbody th { text-align: left; font-weight: 500; }
.adv-table tbody tr:last-child th, .adv-table tbody tr:last-child td { border-bottom: 0; }
.adv-table .ok { color: #2d7a46; }
.adv-table .off { color: #a8651a; }
.adv-alt { margin: 8px 0 0; font-size: 12px; color: #8a6a74; }
.chart-title { display: block; font-size: 13px; font-weight: 600; }
.adv-actions { margin-top: 10px; }

.chat-primary {
  width: 100%;
  padding: 10px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--rose);
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.chat-primary:hover { background: #944a62; }
.chat-retry { align-self: flex-start; padding: 5px 14px; border: 1px solid var(--rose); border-radius: 999px; background: #fff; color: var(--rose); font: inherit; font-size: 12.5px; cursor: pointer; }


/* ---------- Thẻ sản phẩm trong kết quả, biểu mẫu ---------- */
.adv-product { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12.5px; color: #8a6a74; }
.adv-product img { width: 28px; height: 35px; object-fit: cover; border-radius: 5px; background: var(--rose-soft); }
.adv-size.none { font-size: 18px; line-height: 1.3; color: #a8651a; font-family: inherit; }
.adv-src { color: #9a8088; font-weight: 400; }
.adv-mismatch { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; line-height: 1.45; }
.adv-mismatch li { padding: 7px 9px; background: #fdf6ee; border-radius: 9px; color: #7a5a35; }

.chat-form { background: #fff; border: 1px solid var(--rose-line); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.cf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
.cf-row { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #8a6a74; }
.cf-row span { font-weight: 600; }
.cf-row input, .cf-row select {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid #e6d3d8;
  border-radius: 10px;
  font: inherit;
  font-size: 13.5px;
  color: var(--ink);
  background: #fffafa;
}
.cf-row input:focus, .cf-row select:focus { outline: 2px solid #e8b4c2; border-color: var(--rose); }
.cf-row input[aria-invalid='true'], .cf-row select[aria-invalid='true'] { border-color: #d98a7f; background: #fff7f5; }
.cf-row input:disabled, .cf-row select:disabled { opacity: 0.7; }
.cf-error { font-style: normal; font-size: 11.5px; color: #b0463a; }
.cf-note { font-size: 11px; color: #a2929a; text-align: center; }
.chat-primary:disabled { background: #dcc4cb; cursor: not-allowed; }

/* ---------- Gợi ý nhanh + ô nhập ---------- */
.chat-quick { display: flex; flex-wrap: wrap; gap: 7px; padding: 8px 14px 4px; background: #fcf7f6; }
.chat-quick button {
  padding: 6px 12px;
  border: 1px solid #e6c9d1;
  border-radius: 999px;
  background: #fff;
  color: var(--rose);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}
.chat-quick button:hover { background: var(--rose-soft); }

.chat-input { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px 6px; background: #fff; border-top: 1px solid var(--rose-line); }
.chat-input textarea {
  flex: 1;
  min-height: 40px;
  max-height: 110px;
  padding: 10px 14px;
  border: 1px solid #e6d3d8;
  border-radius: 20px;
  resize: none;
  font: inherit;
  line-height: 1.4;
  color: var(--ink);
  background: #fffafa;
}
.chat-input textarea:focus { outline: 2px solid #e8b4c2; outline-offset: 0; border-color: var(--rose); }
.chat-send {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--rose);
  color: #fff;
  cursor: pointer;
}
.chat-send:disabled { background: #dcc4cb; cursor: not-allowed; }
.chat-note { margin: 0; padding: 0 14px 10px; background: #fff; font-size: 11px; text-align: center; color: #a2929a; }

/* ---------- Điện thoại: phủ kín màn hình ---------- */
@media (max-width: 640px) {
  .hqa-chat:not(.embedded) {
    inset: 0;
    width: 100%;
    height: 100dvh;
    border-radius: 0;
    border: 0;
    z-index: 120;
  }
  .hqa-chat.embedded { min-height: 480px; height: calc(100dvh - 190px); }
  .chat-stack { max-width: 93%; }
  .chat-input textarea { font-size: 16px; } /* tránh iOS tự phóng to khi bấm vào ô nhập */
}

@media (prefers-reduced-motion: reduce) {
  .hqa-chat, .chat-bubble.typing i { animation: none; }
  .chat-body { scroll-behavior: auto; }
}
</style>
