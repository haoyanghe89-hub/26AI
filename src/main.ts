import { createApp } from 'vue'
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-alert.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-icon.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-popper.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import './styles.css'
import App from './App.vue'
import { pinia } from './stores'
import { router } from './router'
import { installErrorReporting } from './lib/errorReporting'

const app = createApp(App)
installErrorReporting(app)
app.use(pinia).use(router).mount('#app')
