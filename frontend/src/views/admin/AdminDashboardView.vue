<script setup>
import { computed } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
const revenue = computed(() => shop.orders.reduce((sum, order) => sum + order.subtotal + order.shipping, 0))
</script>
<template>
  <main class="hqa-page hqa-admin-page" style="padding-left:0;padding-right:0"><div class="hqa-eyebrow">OVERVIEW</div><h1>Tổng quan cửa hàng</h1><p>Chào mừng đến bảng điều khiển HQA — dữ liệu minh họa được lưu trong trình duyệt.</p>
    <div class="hqa-stat-grid"><div class="hqa-stat"><div class="value">{{shop.products.length}}</div><div class="label">Sản phẩm</div></div><div class="hqa-stat"><div class="value">{{shop.categories.length}}</div><div class="label">Danh mục</div></div><div class="hqa-stat"><div class="value">{{shop.orders.length}}</div><div class="label">Đơn hàng demo</div></div><div class="hqa-stat"><div class="value" style="font-size:22px">{{money(revenue)}}</div><div class="label">Doanh thu demo</div></div></div>
    <div class="hqa-admin-grid"><section class="hqa-panel"><h3>Quản lý nhanh</h3><p class="hqa-dim">Cập nhật thông tin sản phẩm, nhóm sản phẩm và các mức số đo.</p><div style="display:flex;gap:9px;flex-wrap:wrap"><router-link class="hqa-secondary" to="/admin/san-pham">Sản phẩm ↗</router-link><router-link class="hqa-secondary" to="/admin/bang-size">Bảng size ↗</router-link></div></section><section class="hqa-panel"><h3>Đơn hàng gần đây</h3><div v-if="!shop.orders.length" class="hqa-dim">Chưa có đơn hàng demo từ phía khách.</div><div v-for="order in shop.orders.slice(0,4)" :key="order.id" class="hqa-total-row"><span>{{order.id}}</span><strong>{{money(order.subtotal+order.shipping)}}</strong></div></section></div><div class="hqa-note" style="margin-top:20px">Chỉ phục vụ thiết kế frontend: chưa có đăng nhập quản trị và bảo vệ API. Không triển khai trang này công khai trước khi backend thực hiện xác thực, phân quyền ADMIN và kiểm tra quyền trên từng API.</div>
  </main>
</template>
