import { create } from "zustand"
import { vscode } from "../vscode"

interface CodeReviewState {
	loading: boolean
	currentPath: string | null
	error: string | null
	content: string | null
	setLoading: (loading: boolean) => void
	setCurrentPath: (path: string | null) => void
	setError: (error: string | null) => void
	setContent: (content: string | null) => void
}

export const useCodeReviewStore = create<CodeReviewState>((set) => ({
	loading: false,
	currentPath: null,
	error: null,
	content: null,
	setLoading: (loading) => set({ loading }),
	setCurrentPath: (path) => set({ currentPath: path }),
	setError: (error) => set({ error }),
	setContent: (content) => set({ content }),
}))

// 监听来自VS Code的消息
window.addEventListener("message", (event) => {
	const message = event.data

	switch (message.type) {
		case "code-review-start":
			useCodeReviewStore.getState().setLoading(true)
			useCodeReviewStore.getState().setCurrentPath(message.payload)
			useCodeReviewStore.getState().setError(null)
			useCodeReviewStore.getState().setContent(null)
			break

		case "code-review-complete":
			useCodeReviewStore.getState().setLoading(false)
			if (message.payload) {
				useCodeReviewStore.getState().setContent(message.payload)
			}
			break

		case "code-review-error":
			useCodeReviewStore.getState().setLoading(false)
			useCodeReviewStore.getState().setError(message.payload)
			useCodeReviewStore.getState().setContent(null)
			break
	}
})
