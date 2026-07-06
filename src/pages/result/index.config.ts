export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '游戏结算' })
  : { navigationBarTitleText: '游戏结算' }