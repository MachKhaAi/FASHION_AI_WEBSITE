<script setup>
import '../assets/hqa-pages.css'
const links = [
  { to: '/admin', icon: '▦', text: 'Tổng quan' },
  { to: '/admin/san-pham', icon: '♧', text: 'Sản phẩm' },
  { to: '/admin/danh-muc', icon: '≡', text: 'Danh mục' },
  { to: '/admin/bang-size', icon: '♢', text: 'Bảng size' },
]
</script>
<template>
  <div class="hqa-admin-shell"><aside class="hqa-admin-sidebar"><div class="hqa-admin-brand">HQA</div><div class="hqa-admin-caption">Fashion · Admin demo</div><nav class="hqa-admin-nav" aria-label="Điều hướng quản trị"><router-link v-for="item in links" :key="item.to" :to="item.to" active-class="hqa-admin-active-link" exact-active-class="router-link-active"><span>{{item.icon}}</span>{{item.text}}</router-link></nav><router-link to="/" class="hqa-admin-back">← Trở về cửa hàng</router-link></aside><div class="hqa-admin-main"><header class="hqa-admin-topbar"><span>Trang quản trị · Giao diện demo, không phân quyền thật</span><span>✿ HQA</span></header><router-view /></div></div>
</template>
