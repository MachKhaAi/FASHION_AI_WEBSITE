<script setup>
import { ref } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
const rows = ref(JSON.parse(JSON.stringify(shop.sizeChart)))
const notice = ref('')
const pairs = [
  {key:'chest', title:'Vòng ngực (cm)'}, {key:'waist', title:'Vòng eo (cm)'},
  {key:'hip', title:'Vòng hông (cm)'}, {key:'height', title:'Chiều cao (cm)'},
  {key:'weight', title:'Cân nặng (kg)'},
]
function save() {
  for (const row of rows.value) for (const { key } of pairs) {
    const min = Number(row[`${key}Min`]), max = Number(row[`${key}Max`])
    if (!Number.isFinite(min) || !Number.isFinite(max) || min<=0 || max<min) { notice.value = `Khoảng số đo ${key} của size ${row.size} không hợp lệ.`; return }
  }
  shop.updateSizeChart(rows.value.map(row => { const copy = {...row}; for(const {key} of pairs) {copy[`${key}Min`] = Number(copy[`${key}Min`]); copy[`${key}Max`] = Number(copy[`${key}Max`])} return copy }))
  notice.value = 'Đã lưu bảng size demo trên trình duyệt.'
}
</script>
<template>
  <main class="hqa-page hqa-admin-page" style="padding-left:0;padding-right:0"><div class="hqa-eyebrow">SIZE GUIDE</div><h1>Quản lý bảng size</h1><p>Chỉnh sửa các khoảng số đo minh họa, dùng chung cho chức năng tư vấn size của giao diện demo.</p><section class="hqa-panel"><form @submit.prevent="save"><div v-for="row in rows" :key="row.size" style="padding:14px 0;border-bottom:1px solid #f0e2e4"><h3 style="margin-bottom:13px">Kích thước {{row.size}}</h3><div class="hqa-form-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px 18px"><div v-for="item in pairs" :key="item.key" class="hqa-form-field"><label>{{item.title}}</label><div style="display:flex;align-items:center;gap:8px"><input v-model.number="row[`${item.key}Min`]" type="number" min="1" step="0.1" :aria-label="`${item.title} tối thiểu size ${row.size}`" /><span class="hqa-dim">đến</span><input v-model.number="row[`${item.key}Max`]" type="number" min="1" step="0.1" :aria-label="`${item.title} tối đa size ${row.size}`" /></div></div></div></div><div v-if="notice" class="hqa-note" role="status" style="margin-top:18px">{{notice}}</div><button class="hqa-primary" type="submit" style="margin-top:18px">Lưu bảng size demo</button></form></section><p class="hqa-note" style="margin-top:18px">Hệ thống nghiệp vụ thực tế cần hỗ trợ bảng size theo danh mục và ưu tiên bảng riêng của sản phẩm. Màn hình này mới là phiên bản tối giản cho bước thiết kế frontend.</p></main>
</template>
