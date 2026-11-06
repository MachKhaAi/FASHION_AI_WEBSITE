<script setup>
import HqaSizeChat from '../../components/chatbot/HqaSizeChat.vue'
import '../../assets/hqa-pages.css'
</script>
<template>
  <main class="hqa-page">
    <nav class="hqa-breadcrumb"><router-link to="/">Trang chủ</router-link> › Tư vấn size</nav>
    <div class="hqa-head">
      <div class="hqa-eyebrow">FIND YOUR PERFECT FIT</div>
      <h1 class="hqa-page-title">Size vừa vặn, nàng thêm tự tin</h1>
      <p class="hqa-subtitle">Trò chuyện với trợ lý bằng tiếng Việt: cho mình biết chiều cao, cân nặng hoặc số đo 3 vòng và sản phẩm bạn muốn mua, trợ lý sẽ đối chiếu với bảng size của HQA và giải thích vì sao chọn size đó.</p>
    </div>
    <HqaSizeChat embedded />
  </main>
</template>
