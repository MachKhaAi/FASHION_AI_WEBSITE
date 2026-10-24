import { createRouter, createWebHistory } from "vue-router";
import ShopLayout from "../layouts/ShopLayout.vue";
import HomeView from "../views/shop/HomeView.vue";
export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      component: ShopLayout,
      children: [{ path: "", name: "home", component: HomeView }],
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});
