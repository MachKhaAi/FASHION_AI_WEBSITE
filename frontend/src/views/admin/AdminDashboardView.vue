<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useHqaShopStore } from '../../stores/hqaShop'
import { useAdminAuthStore } from '../../stores/adminAuth'
import { money } from '../../data/hqaCatalog'
import '../../assets/hqa-pages.css'
const shop = useHqaShopStore()
const admin = useAdminAuthStore()

const orders = computed(() => shop.adminOrders)
const pendingCount = computed(() => orders.value.filter(o => o.statusCode === 'pending').length)
// Doanh thu: chỉ tính đơn đã được duyệt (không tính đơn chờ duyệt và đơn đã hủy)
const revenue = computed(() => orders.value
  .filter(o => ['confirmed', 'shipping', 'completed'].includes(o.statusCode))
  .reduce((sum, o) => sum + o.subtotal + o.shipping, 0))

// Tên nút cho từng trạng thái kế tiếp
const ACTION = { confirmed: 'Duyệt đơn', shipping: 'Giao hàng', completed: 'Hoàn thành', cancelled: 'Hủy đơn' }
const BADGE = {
  pending: 'background:#fff3e0;color:#a65f00',
  confirmed: 'background:#e6f4ea;color:#1e6b3a',
  shipping: 'background:#e3f0fb;color:#1a5a96',
  completed: 'background:#e6f4ea;color:#1e6b3a',
  cancelled: 'background:#fdeaea;color:#b3261e',
}
const customerName = (o) => o.customer?.name || o.customer?.fullName || o.customer?.full_name || 'Khách hàng'
const when = (iso) => { try { return new Date(iso).toLocaleString('vi-VN') } catch { return '' } }

function act(order, status) {
  if (status === 'cancelled' && !window.confirm(`Hủy đơn ${order.id}? Hàng sẽ được trả lại kho.`)) return
  shop.setOrderStatus(order.id, status)
}

let timer = null
onMounted(() => {
  if (!shop.catalogLoaded) shop.fetchCatalog()
  shop.fetchAdminOrders()
  timer = window.setInterval(() => { if (!document.hidden) shop.fetchAdminOrders() }, 15000) // tự cập nhật đơn mới
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>
<template>
  <main class="hqa-page hqa-admin-page" style="padding-left:0;padding-right:0"><div class="hqa-eyebrow">OVERVIEW</div><h1>Tổng quan cửa hàng</h1><p>Xin chào {{ admin.admin?.full_name || 'quản trị viên' }}! Đây là bảng điều khiển HQA.</p>
    <div class="hqa-stat-grid"><div class="hqa-stat"><div class="value">{{shop.products.length}}</div><div class="label">Sản phẩm</div></div><div class="hqa-stat"><div class="value">{{shop.categories.length}}</div><div class="label">Danh mục</div></div><div class="hqa-stat"><div class="value">{{pendingCount}}</div><div class="label">Đơn chờ duyệt</div></div><div class="hqa-stat"><div class="value" style="font-size:22px">{{money(revenue)}}</div><div class="label">Doanh thu (đơn đã duyệt)</div></div></div>
    <div class="hqa-admin-grid"><section class="hqa-panel"><h3>Quản lý nhanh</h3><p class="hqa-dim">Cập nhật thông tin sản phẩm, nhóm sản phẩm và các mức số đo.</p><div style="display:flex;gap:9px;flex-wrap:wrap"><router-link class="hqa-secondary" to="/admin/san-pham">Sản phẩm ↗</router-link><router-link class="hqa-secondary" to="/admin/danh-muc">Danh mục ↗</router-link><router-link class="hqa-secondary" to="/admin/bang-size">Bảng size ↗</router-link></div></section>
      <section class="hqa-panel"><h3>Đơn hàng cần xử lý</h3><div v-if="!orders.length" class="hqa-dim">Chưa có đơn hàng nào từ khách.</div>
        <div v-for="order in orders.slice(0, 8)" :key="order.id" style="padding:12px 0;border-top:1px solid #f0dfe2">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><strong>{{order.id}}</strong><span :style="BADGE[order.statusCode]" style="padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600">{{order.status}}</span></div>
          <div class="hqa-dim" style="margin-top:4px">{{customerName(order)}}<template v-if="order.customer?.phone"> · {{order.customer.phone}}</template> · {{when(order.createdAt)}}</div>
          <div style="margin-top:6px;font-size:14px"><div v-for="(it, i) in order.items" :key="i">{{it.name}} ({{it.size}}, {{it.color}}) × {{it.qty}}</div></div>
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap"><strong>{{money(order.subtotal + order.shipping)}}</strong>
            <span style="display:flex;gap:8px;flex-wrap:wrap"><button v-for="next in order.nextStatuses" :key="next" type="button" :class="next === 'cancelled' ? 'hqa-outline' : 'hqa-primary'" style="padding:7px 14px;min-height:0" @click="act(order, next)">{{ACTION[next]}}</button></span></div>
        </div>
      </section></div>
    <div class="hqa-note" style="margin-top:20px">Khách đặt hàng sẽ hiện ở đây (tự cập nhật mỗi 15 giây). Bấm <strong>Duyệt đơn</strong> để xác nhận, rồi <strong>Giao hàng</strong> khi giao cho khách. Khách sẽ thấy trạng thái mới ("Đã duyệt", "Đang giao hàng") ở trang "Tài khoản của tôi". Hủy đơn sẽ trả hàng lại kho.</div>
  </main>
</template>