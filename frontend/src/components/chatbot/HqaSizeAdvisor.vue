<script setup>
import { computed, ref } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'
const props = defineProps({ product: { type: Object, default: null } })
const emit = defineEmits(['choose-size'])
const shop = useHqaShopStore()
const fields = [
  { key: 'height', label: 'Chiều cao (cm)' }, { key: 'weight', label: 'Cân nặng (kg)' },
  { key: 'chest', label: 'Vòng ngực (cm)' }, { key: 'waist', label: 'Vòng eo (cm)' }, { key: 'hip', label: 'Vòng hông (cm)' },
]
const form = ref({ height: '', weight: '', chest: '', waist: '', hip: '' })
const result = ref(null)
const error = ref('')
const hasResult = computed(() => !!result.value)
function suggest() {
  error.value = ''; result.value = null
  const provided = fields.filter(f => form.value[f.key] !== '' && form.value[f.key] !== null)
  if (!provided.length) { error.value = 'Hãy nhập ít nhất một số đo để nhận gợi ý.'; return }
  if (provided.some(f => !Number.isFinite(Number(form.value[f.key])) || Number(form.value[f.key]) <= 0)) {
    error.value = 'Vui lòng nhập số đo là số dương hợp lệ.'; return
  }
  const allowedSizes = props.product?.sizes || ['S', 'M', 'L', 'XL']
  const chart = shop.sizeChart.filter(row => allowedSizes.includes(row.size))
  if (!chart.length) { error.value = 'Sản phẩm này chưa có bảng size tham khảo.'; return }
  // Khoảng cách chuẩn hóa đến khoảng số đo mẫu; thông số ngực/eo/hông có trọng số cao hơn.
  const weighted = chart.map(row => {
    let score = 0
    const reasons = []
    for (const { key, label } of provided) {
      const min = Number(row[`${key}Min`]), max = Number(row[`${key}Max`]), x = Number(form.value[key])
      const width = Math.max(max - min, 1)
      const distance = x < min ? (min - x) / width : x > max ? (x - max) / width : 0
      const weight = ['chest', 'waist', 'hip'].includes(key) ? 2 : 1
      score += distance * weight
      if (distance === 0) reasons.push(label.replace(/ \(.+\)/, '').toLowerCase())
    }
    return { size: row.size, score, reasons }
  }).sort((a, b) => a.score - b.score)
  result.value = weighted[0]
}
</script>
<template>
  <section class="hqa-advisor" aria-label="Trợ lý tư vấn kích thước">
    <div class="hqa-advisor-banner">
      <h2>✧ Trợ lý tư vấn size</h2>
      <p>Gợi ý kích thước dựa trên số đo bạn cung cấp</p>
    </div>
    <div class="hqa-advisor-body">
      <div class="hqa-chat-bubble">Chào bạn! Bạn có thể nhập chiều cao, cân nặng hoặc số đo vòng ngực, eo, hông. Mình sẽ đối chiếu với bảng size minh họa của HQA nhé ♡</div>
      <div class="hqa-advisor-grid">
        <div v-for="field in fields" :key="field.key" class="hqa-form-field">
          <label :for="`hqa-measure-${field.key}`">{{ field.label }}</label>
          <input :id="`hqa-measure-${field.key}`" v-model="form[field.key]" min="1" step="0.1" type="number" :placeholder="field.key === 'height' ? 'Ví dụ: 160' : field.key === 'weight' ? 'Ví dụ: 52' : 'Nhập số đo'" />
        </div>
      </div>
      <div v-if="error" class="hqa-alert" role="alert">{{ error }}</div>
      <button class="hqa-primary" type="button" @click="suggest">Tư vấn size của tôi ↗</button>
      <div v-if="hasResult" class="hqa-chat-bubble result" role="status" style="margin-top:18px">
        <div style="font-size:12px">Size gợi ý để tham khảo:</div>
        <div style="font-size:28px;font-weight:750;margin:5px 0">{{ result.size }}</div>
        <div v-if="result.reasons.length">Các số đo thuộc khoảng size này: {{ result.reasons.join(', ') }}.</div>
        <div v-else>Đây là size có độ lệch ít nhất so với các khoảng số đo minh họa. Các số đo đã nhập chưa hoàn toàn nằm trong một khoảng size.</div>
        <button v-if="product && product.sizes.includes(result.size)" class="hqa-outline hqa-small-btn" style="margin-top:11px" type="button" @click="emit('choose-size', result.size)">Chọn size {{ result.size }}</button>
      </div>
      <p class="hqa-advisor-disclaimer">Bản demo giao diện: kết quả do thuật toán so khớp đơn giản xử lý ngay trên trình duyệt, <strong>chưa sử dụng AI hoặc API backend</strong>. Bảng size hiện là dữ liệu mẫu, cần thay bằng số liệu sản phẩm đã xác minh.</p>
    </div>
  </section>
</template>
