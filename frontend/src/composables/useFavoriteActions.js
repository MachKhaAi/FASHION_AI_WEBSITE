import { useRoute, useRouter } from 'vue-router'
import { hasUserToken, useHqaShopStore } from '../stores/hqaShop'

// Dùng chung cho thẻ sản phẩm và trang chi tiết; yêu cầu đăng nhập trước khi lưu vào DB.
export function useFavoriteActions() {
  const shop = useHqaShopStore()
  const router = useRouter()
  const route = useRoute()

  async function toggleFavorite(productId) {
    if (!hasUserToken()) {
      await router.push({ path: '/dang-nhap', query: { redirect: route.fullPath } })
      return false
    }
    const result = await shop.toggleFavorite(productId)
    if (!result.ok && result.reason !== 'busy' && result.reason !== 'auth') {
      window.alert(result.message || 'Không thể cập nhật yêu thích. Vui lòng thử lại.')
    }
    return result.ok
  }

  return { shop, toggleFavorite }
}
