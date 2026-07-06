export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '无间疑云' })
  : { navigationBarTitleText: '无间疑云' }