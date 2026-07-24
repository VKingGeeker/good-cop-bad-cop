export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '无间疑云', navigationStyle: 'custom' })
  : { navigationBarTitleText: '无间疑云', navigationStyle: 'custom' }