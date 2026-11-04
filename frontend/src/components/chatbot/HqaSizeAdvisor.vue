<script setup>
import { checkAiSize, getMyProfile, getUserToken } from '../../services/api'
import { computed, onMounted, ref } from 'vue'
import '../../assets/hqa-pages.css'

const props = defineProps({ product: { type: Object, default: null } })
const emit = defineEmits(['choose-size'])

// Khoảng min/max khớp với backend (routes/sizeAdvisor.js)
const fields = [
  { key: 'height', label: 'Chiều cao (cm)', unit: 'cm', min: 100, max: 230 },
  { key: 'weight', label: 'Cân nặng (kg)', unit: 'kg', min: 20, max: 250 },
  { key: 'chest', label: 'Vòng ngực (cm)', unit: 'cm', min: 50, max: 160 },
  { key: 'waist', label: 'Vòng eo (cm)', unit: 'cm', min: 40, max: 160 },
  { key: 'hip', label: 'Vòng hông (cm)', unit: 'cm', min: 50, max: 170 },
]
const form = ref({ height: '', weight: '', chest: '', waist: '', hip: '' })
const result = ref(null)
const error = ref('')
const loading = ref(false)
const prefilled = ref(false) // true nếu form được điền sẵn từ số đo đã lưu trong hồ sơ
const hasResult = computed(() => !!result.value)

const CONFIDENCE_TEXT = {
  high: 'Khớp hoàn toàn',
  medium: 'Khá phù hợp',
  low: 'Chỉ mang tính tham khảo',
}

// Đã đăng nhập thì tự điền số đo đã lưu để khách không phải nhập lại.
// Không đăng nhập hoặc không lấy được hồ sơ thì bỏ qua, vẫn dùng bình thường.
onMounted(async () => {
  if (!getUserToken()) return
  try {
    const { data } = await getMyProfile()
    const user = data?.user || {}
    let filled = false
    for (const f of fields) {
      if (form.value[f.key] === '' && user[f.key] !== null && user[f.key] !== undefined) {
        form.value[f.key] = user[f.key]
        filled = true
      }
    }
    prefilled.value = filled
  } catch {
    // bỏ qua
  }
})

function statusText(d) {
  if (d.status === 'ok') return '✓ Trong khoảng'
  return d.status === 'above' ? `Lớn hơn ${d.diff} ${d.unit}` : `Nhỏ hơn ${d.diff} ${d.unit}`
}

async function suggest() {
  error.value = ''
  result.value = null

  const provided = fields.filter((f) => form.value[f.key] !== '' && form.value[f.key] !== null)

  if (!provided.length) {
    error.value = 'Hãy nhập ít nhất một số đo để nhận gợi ý.'
    return
  }

  for (const f of provided) {
    const n = Number(form.value[f.key])
    if (!Number.isFinite(n) || n < f.min || n > f.max) {
      error.value = `${f.label.replace(/ \(.*\)/, '')} phải nằm trong khoảng ${f.min}–${f.max} ${f.unit}.`
      return
    }
  }

  loading.value = true
  try {
    const payload = Object.fromEntries(provided.map((f) => [f.key, Number(form.value[f.key])]))
    const response = await checkAiSize(payload)
    const data = response.data

    if (!data.success) {
      throw new Error(data.message || 'Không thể tư vấn size.')
    }
    if (!data.recommended_size) {
      error.value = data.message || 'Hiện chưa có bảng size để tư vấn.'
      return
    }

    result.value = {
      size: data.recommended_size,
      confidence: data.confidence || 'low',
      message: data.message || '',
      details: Array.isArray(data.details) ? data.details : [],
      alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
    }
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      err.message ||
      'Không thể kết nối dịch vụ tư vấn size.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="hqa-advisor" aria-label="Trợ lý tư vấn kích thước">
    <div class="hqa-advisor-banner">
      <h2>✧ Trợ lý tư vấn size</h2>
      <p>Gợi ý kích thước dựa trên số đo bạn cung cấp</p>
    </div>
    <div class="hqa-advisor-body">
      <div class="hqa-chat-bubble">
        Chào bạn! Bạn có thể nhập chiều cao, cân nặng hoặc số đo vòng ngực, eo, hông. Mình sẽ đối chiếu với bảng size của HQA nhé ♡
      </div>
      <p v-if="prefilled" class="hqa-dim" style="font-size: 13px; margin: 10px 0 0">
        Đã điền sẵn từ số đo bạn lưu trong hồ sơ. Bạn có thể chỉnh lại nếu muốn.
      </p>

      <div class="hqa-advisor-grid">
        <div v-for="field in fields" :key="field.key" class="hqa-form-field">
          <label :for="`hqa-measure-${field.key}`">{{ field.label }}</label>
          <input
            :id="`hqa-measure-${field.key}`"
            v-model="form[field.key]"
            :min="field.min"
            :max="field.max"
            step="0.1"
            type="number"
            inputmode="decimal"
            :placeholder="field.key === 'height' ? 'Ví dụ: 160' : field.key === 'weight' ? 'Ví dụ: 52' : 'Nhập số đo'"
            @keyup.enter="suggest"
          />
        </div>
      </div>

      <div v-if="error" class="hqa-alert" role="alert">{{ error }}</div>
      <button class="hqa-primary" type="button" :disabled="loading" @click="suggest">
        {{ loading ? 'Đang tính...' : 'Tư vấn size của tôi ↗' }}
      </button>

      <div v-if="hasResult" class="hqa-chat-bubble result" role="status" style="margin-top: 18px">
        <div style="font-size: 12px">Size gợi ý để tham khảo:</div>
        <div style="font-size: 28px; font-weight: 750; margin: 5px 0">{{ result.size }}</div>
        <div class="adv-badge" :class="`is-${result.confidence}`">{{ CONFIDENCE_TEXT[result.confidence] }}</div>
        <div style="margin-top: 8px">{{ result.message }}</div>

        <table v-if="result.details.length" class="adv-table">
          <thead>
            <tr>
              <th scope="col">Số đo</th>
              <th scope="col">Của bạn</th>
              <th scope="col">Size {{ result.size }}</th>
              <th scope="col">Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in result.details" :key="d.key">
              <th scope="row">{{ d.label }}</th>
              <td>{{ d.value }} {{ d.unit }}</td>
              <td>{{ d.min }}–{{ d.max }}</td>
              <td :class="d.status === 'ok' ? 'adv-ok' : 'adv-off'">{{ statusText(d) }}</td>
            </tr>
          </tbody>
        </table>

        <div v-if="result.alternatives.length" class="hqa-dim" style="margin-top: 10px; font-size: 13px">
          Các size gần nhất khác: {{ result.alternatives.map((a) => a.size).join(', ') }}.
        </div>

        <button
          v-if="product && product.sizes.includes(result.size)"
          class="hqa-outline hqa-small-btn"
          style="margin-top: 11px"
          type="button"
          @click="emit('choose-size', result.size)"
        >
          Chọn size {{ result.size }}
        </button>
      </div>

      <p class="hqa-advisor-disclaimer">
        Kết quả được tính từ bảng size của cửa hàng dựa trên các số đo bạn cung cấp, chỉ mang tính <strong>tham khảo</strong>.
        Số đo cơ thể và dáng mặc có thể khác nhau tùy từng thiết kế sản phẩm.
      </p>
    </div>
  </section>
</template>

<style scoped>
.adv-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #fbf1f4;
  color: #a95d73;
}
.adv-badge.is-high {
  background: #e8f5ec;
  color: #2d7a46;
}
.adv-badge.is-low {
  background: #fdf1e3;
  color: #a8651a;
}

.adv-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #ead7dc;
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.adv-table th,
.adv-table td {
  padding: 8px 10px;
  text-align: center;
  border-bottom: 1px solid #f1e6e9;
}
.adv-table thead th {
  background: #fbf1f4;
  color: #a95d73;
  font-weight: 600;
}
.adv-table tbody th {
  font-weight: 400;
  text-align: left;
}
.adv-table tbody tr:last-child th,
.adv-table tbody tr:last-child td {
  border-bottom: none;
}
.adv-ok {
  color: #2d7a46;
}
.adv-off {
  color: #a8651a;
}
</style>