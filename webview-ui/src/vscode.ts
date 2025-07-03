// 获取VS Code webview API
declare global {
	interface Window {
		acquireVsCodeApi: () => {
			postMessage: (message: any) => void
			getState: () => any
			setState: (state: any) => void
		}
	}
}

// 获取VS Code API实例
export const vscode = window.acquireVsCodeApi()
