export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '游戏结算', navigationStyle: 'custom' })
  : { navigationBarTitleText: '游戏结算', navigationStyle: 'custom' }