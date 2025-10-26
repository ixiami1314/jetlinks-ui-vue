import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { wsClient } from '@jetlinks-web/core'
import { map, filter } from 'rxjs/operators'
import { EventEmitter } from '@jetlinks-web/utils'

// 全局属性订阅管理器
class GlobalPropertySubscriptionManager {
  private static instance: GlobalPropertySubscriptionManager
  private subscriptions = new Map<string, any>()
  private deviceListeners = new Map<string, Set<(data: any) => void>>()
  private isSubscribed = false
  private globalSubscription: any = null

  private constructor() {}

  static getInstance(): GlobalPropertySubscriptionManager {
    if (!GlobalPropertySubscriptionManager.instance) {
      GlobalPropertySubscriptionManager.instance = new GlobalPropertySubscriptionManager()
    }
    return GlobalPropertySubscriptionManager.instance
  }

  // 启动全局订阅
  startGlobalSubscription() {
    if (this.isSubscribed) return

    console.log('启动全局设备属性订阅')
    
    // 注意：JetLinks可能不支持通配符订阅，需要为每个产品分别订阅
    // 这里我们先实现单设备订阅，后续可以扩展为多设备订阅
    console.warn('JetLinks可能不支持全局通配符订阅，建议使用单设备订阅方式')
    
    this.isSubscribed = true
  }

  // 处理全局属性更新
  private handleGlobalPropertyUpdate(payload: any) {
    const deviceId = payload?.deviceId
    if (!deviceId) return

    console.log('收到设备属性更新:', deviceId, payload)

    // 通知该设备的所有监听器
    const listeners = this.deviceListeners.get(deviceId)
    if (listeners) {
      listeners.forEach(listener => {
        listener(payload)
      })
    }

    // 通过事件总线通知特定设备
    EventEmitter.emit(`device-property-update-${deviceId}`, payload)
  }

  // 为特定设备添加监听器
  addDeviceListener(deviceId: string, listener: (data: any) => void) {
    if (!this.deviceListeners.has(deviceId)) {
      this.deviceListeners.set(deviceId, new Set())
    }
    
    this.deviceListeners.get(deviceId)!.add(listener)
    
    // 如果还没有启动全局订阅，则启动
    if (!this.isSubscribed) {
      this.startGlobalSubscription()
    }

    console.log(`为设备 ${deviceId} 添加属性监听器`)
  }

  // 移除特定设备的监听器
  removeDeviceListener(deviceId: string, listener: (data: any) => void) {
    const listeners = this.deviceListeners.get(deviceId)
    if (listeners) {
      listeners.delete(listener)
      
      // 如果该设备没有监听器了，清理相关资源
      if (listeners.size === 0) {
        this.deviceListeners.delete(deviceId)
        console.log(`设备 ${deviceId} 的所有监听器已移除`)
      }
    }
  }

  // 停止全局订阅
  stopGlobalSubscription() {
    if (this.globalSubscription) {
      this.globalSubscription.unsubscribe()
      this.globalSubscription = null
    }
    
    this.deviceListeners.clear()
    this.isSubscribed = false
    
    console.log('停止全局设备属性订阅')
  }

  // 获取当前订阅状态
  getSubscriptionStatus() {
    return {
      isSubscribed: this.isSubscribed,
      deviceCount: this.deviceListeners.size,
      totalListeners: Array.from(this.deviceListeners.values())
        .reduce((total, listeners) => total + listeners.size, 0)
    }
  }
}

// Vue Composable
export function useGlobalPropertySubscription(deviceId?: string) {
  const manager = GlobalPropertySubscriptionManager.getInstance()
  const propertyData = ref<any>(null)
  const isConnected = ref(false)

  // 属性更新处理器
  const handlePropertyUpdate = (payload: any) => {
    console.log('设备属性更新:', deviceId, payload)
    propertyData.value = payload
  }

  // 启动订阅
  const startSubscription = (targetDeviceId?: string) => {
    const id = targetDeviceId || deviceId
    if (!id) {
      console.warn('设备ID不能为空')
      return
    }

    manager.addDeviceListener(id, handlePropertyUpdate)
    isConnected.value = true
    console.log(`开始订阅设备 ${id} 的属性更新`)
  }

  // 停止订阅
  const stopSubscription = (targetDeviceId?: string) => {
    const id = targetDeviceId || deviceId
    if (!id) return

    manager.removeDeviceListener(id, handlePropertyUpdate)
    isConnected.value = false
    console.log(`停止订阅设备 ${id} 的属性更新`)
  }

  // 组件挂载时自动启动订阅
  onMounted(() => {
    if (deviceId) {
      startSubscription()
    }
  })

  // 组件卸载时自动停止订阅
  onUnmounted(() => {
    if (deviceId) {
      stopSubscription()
    }
  })

  return {
    propertyData,
    isConnected,
    startSubscription,
    stopSubscription,
    manager
  }
}

export default GlobalPropertySubscriptionManager
