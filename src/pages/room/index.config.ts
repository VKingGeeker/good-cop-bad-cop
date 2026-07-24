export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '游戏房间', navigationStyle: 'custom' })
  : { navigationBarTitleText: '游戏房间', navigationStyle: 'custom' }