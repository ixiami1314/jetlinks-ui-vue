import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { wsClient } from '@jetlinks-web/core'
import { map, filter } from 'rxjs/operators'
import { EventEmitter } from '@jetlinks-web/utils'

// 设备属性订阅管理器 - 基于JetLinks架构
class DevicePropertySubscriptionManager {
  private static instance: DevicePropertySubscriptionManager
  private subscriptions = new Map<string, any>()
  private deviceListeners = new Map<string, Set<(data: any) => void>>()

  private constructor() {}

  static getInstance(): DevicePropertySubscriptionManager {
    if (!DevicePropertySubscriptionManager.instance) {
      DevicePropertySubscriptionManager.instance = new DevicePropertySubscriptionManager()
    }
    return DevicePropertySubscriptionManager.instance
  }

  // 为特定设备启动属性订阅
  startDeviceSubscription(deviceId: string, productId: string, properties: string[]) {
    const subscriptionKey = `device-property-${deviceId}-${productId}`
    
    if (this.subscriptions.has(subscriptionKey)) {
      console.log(`设备 ${deviceId} 的属性订阅已存在，跳过重复订阅`)
      return
    }

    console.log(`启动设备 ${deviceId} 的属性订阅`)
    
    // 使用JetLinks的标准topic格式
    const topic = `/dashboard/device/${productId}/properties/realTime`
    const subscriptionId = `instance-info-property-${deviceId}-${productId}-${properties.join('-')}`
    
    const subscription = wsClient.getWebSocket(subscriptionId, topic, {
      deviceId: deviceId,
      properties: properties,
      history: 1,
    })
      ?.pipe(
        map((res: any) => res.payload),
        filter((payload: any) => payload?.value?.property) // 过滤出有效的属性数据
      )
      .subscribe((payload: any) => {
        this.handleDevicePropertyUpdate(deviceId, payload)
      })

    if (subscription) {
      this.subscriptions.set(subscriptionKey, subscription)
    }
  }

  // 停止特定设备的属性订阅
  stopDeviceSubscription(deviceId: string, productId: string) {
    const subscriptionKey = `device-property-${deviceId}-${productId}`
    const subscription = this.subscriptions.get(subscriptionKey)
    
    if (subscription) {
      console.log(`停止设备 ${deviceId} 的属性订阅`)
      subscription.unsubscribe()
      this.subscriptions.delete(subscriptionKey)
    }
  }

  // 处理设备属性更新
  private handleDevicePropertyUpdate(deviceId: string, payload: any) {
    console.log(`设备 ${deviceId} 属性更新:`, payload)
    
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

  // 停止所有订阅
  stopAllSubscriptions() {
    console.log('停止所有设备属性订阅')
    
    this.subscriptions.forEach((subscription, key) => {
      subscription.unsubscribe()
      console.log(`停止订阅: ${key}`)
    })
    
    this.subscriptions.clear()
    this.deviceListeners.clear()
  }

  // 获取当前订阅状态
  getSubscriptionStatus() {
    return {
      subscriptionCount: this.subscriptions.size,
      deviceCount: this.deviceListeners.size,
      totalListeners: Array.from(this.deviceListeners.values())
        .reduce((total, listeners) => total + listeners.size, 0)
    }
  }
}

// Vue Composable
export function useDevicePropertySubscription(deviceId?: string, productId?: string) {
  const manager = DevicePropertySubscriptionManager.getInstance()
  const propertyData = ref<any>(null)
  const isConnected = ref(false)

  // 属性更新处理器
  const handlePropertyUpdate = (payload: any) => {
    const currentDeviceId = deviceId || 'unknown'
    console.log('设备属性更新:', currentDeviceId, payload)
    propertyData.value = payload
  }

  // 启动订阅
  const startSubscription = (targetDeviceId?: string, targetProductId?: string, properties?: string[]) => {
    const id = targetDeviceId || deviceId
    const pid = targetProductId || productId
    const props = properties || []
    
    if (!id || !pid) {
      console.warn('设备ID和产品ID不能为空')
      return
    }

    manager.addDeviceListener(id, handlePropertyUpdate)
    manager.startDeviceSubscription(id, pid, props)
    isConnected.value = true
    console.log(`开始订阅设备 ${id} 的属性更新`)
  }

  // 停止订阅
  const stopSubscription = (targetDeviceId?: string, targetProductId?: string) => {
    const id = targetDeviceId || deviceId
    const pid = targetProductId || productId
    
    if (!id || !pid) return

    manager.removeDeviceListener(id, handlePropertyUpdate)
    manager.stopDeviceSubscription(id, pid)
    isConnected.value = false
    console.log(`停止订阅设备 ${id} 的属性更新`)
  }

  // 组件挂载时自动启动订阅
  onMounted(() => {
    if (deviceId && productId) {
      startSubscription()
    }
  })

  // 组件卸载时自动停止订阅
  onUnmounted(() => {
    if (deviceId && productId) {
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

export default DevicePropertySubscriptionManager
