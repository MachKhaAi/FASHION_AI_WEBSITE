<script setup>
import { ref } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore(), name = ref(''), message = ref('')
function add() { const ok = shop.addCategory(name.value); message.value = ok ? 'Đã thêm danh mục demo.' : 'Tên danh mục trống hoặc bị trùng.'; if (ok) name.value = '' }
function remove(item) {
  if (shop.products.some(p=>p.categoryId===item.id)) { message.value = 'Không thể xóa danh mục đang có sản phẩm.'; return }
  if (window.confirm(`Bạn chắc chắn muốn xóa danh mục “${item.name}”?`)) { shop.deleteCategory(item.id); message.value = 'Đã xóa danh mục.' }
}
</script>
<template>
  <main class="hqa-page hqa-admin-page" style="padding-left:0;padding-right:0"><div class="hqa-eyebrow">MANAGE CATEGORIES</div><h1>Quản lý danh mục</h1><p>Danh mục giúp khách dễ dàng tìm kiếm các nhóm sản phẩm.</p><div class="hqa-admin-grid"><section class="hqa-panel"><h3>Danh mục hiện có</h3><div v-for="item in shop.categories" :key="item.id" class="hqa-total-row" style="border-bottom:1px solid #f1e7e7"><span>{{item.icon}} &nbsp; {{item.name}}</span><span class="hqa-dim">{{shop.products.filter(p=>p.categoryId===item.id).length}} sản phẩm &nbsp; <button type="button" class="hqa-link-button" @click="remove(item)">Xóa</button></span></div></section><section class="hqa-panel"><h3>Thêm danh mục</h3><form @submit.prevent="add"><div class="hqa-form-field"><label for="category-name">Tên danh mục</label><input id="category-name" v-model.trim="name" required placeholder="Ví dụ: Áo khoác" /></div><button class="hqa-primary" type="submit">+ Tạo danh mục</button></form><div v-if="message" class="hqa-note" style="margin-top:16px" role="status">{{message}}</div></section></div></main>
</template>
