export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '游戏房间' })
  : { navigationBarTitleText: '游戏房间' }