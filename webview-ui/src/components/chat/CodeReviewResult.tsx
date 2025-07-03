import React from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useCodeReviewStore } from "../../stores/codeReviewStore"

interface CodeReviewProps {
	content?: string
	path?: string
}

const CodeReviewResult: React.FC<CodeReviewProps> = ({ content: propContent, path }) => {
	const { loading, error, content: storeContent } = useCodeReviewStore()

	// 优先使用props中的content，如果没有则使用store中的content
	const finalContent = propContent || storeContent || ""

	// 渲染内容
	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex items-center justify-center py-8">
					<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
					<span className="ml-3 text-gray-400">正在分析代码，请稍候...</span>
				</div>
			)
		}

		if (error) {
			return (
				<div className="flex items-center justify-center py-8 text-red-400">
					<span className="text-2xl mr-2">⚠️</span>
					<span>{error}</span>
				</div>
			)
		}

		if (!finalContent) {
			return (
				<div className="flex items-center justify-center py-8 text-gray-400">
					<span>等待代码审查结果...</span>
				</div>
			)
		}

		return finalContent.split("\n").map((line, index) => {
			// 处理不同的Markdown元素
			if (line.startsWith("# ")) {
				return (
					<h1 key={index} className="text-2xl font-bold mb-4 text-green-400">
						{line.substring(2)}
					</h1>
				)
			} else if (line.startsWith("## ")) {
				return (
					<h2 key={index} className="text-xl font-semibold mb-3 mt-6 text-blue-400">
						{line.substring(3)}
					</h2>
				)
			} else if (line.startsWith("### ")) {
				return (
					<h3 key={index} className="text-lg font-semibold mb-2 mt-4 text-yellow-400">
						{line.substring(4)}
					</h3>
				)
			} else if (line.startsWith("**") && line.endsWith("**:")) {
				return (
					<div key={index} className="font-semibold text-white mb-2">
						{line.slice(2, -3)}:
					</div>
				)
			} else if (line.includes("🔴") || line.includes("🟠") || line.includes("🟡") || line.includes("🔵")) {
				const severityColor = getSeverityColor(line)
				return (
					<div key={index} className={`p-2 rounded mb-2 ${severityColor}`}>
						{line}
					</div>
				)
			} else if (line.trim() === "---") {
				return <hr key={index} className="my-4 border-gray-600" />
			} else if (line.startsWith("| ") && line.includes(" | ")) {
				// 简单表格行处理
				const cells = line
					.split("|")
					.map((cell) => cell.trim())
					.filter((cell) => cell !== "")
				return (
					<div key={index} className="flex border-b border-gray-600 py-1">
						{cells.map((cell, cellIndex) => (
							<div key={cellIndex} className="flex-1 px-2 text-gray-300">
								{cell}
							</div>
						))}
					</div>
				)
			} else if (line.startsWith("- ") || line.startsWith("* ")) {
				return (
					<div key={index} className="ml-4 text-gray-300">
						• {line.substring(2)}
					</div>
				)
			} else if (line.trim() !== "") {
				return (
					<div key={index} className="mb-1 text-gray-300">
						{line}
					</div>
				)
			}
			return <div key={index} className="h-2"></div> // 空行
		})
	}

	const getSeverityColor = (line: string) => {
		if (line.includes("🔴")) return "bg-red-900 border-l-4 border-red-500"
		if (line.includes("🟠")) return "bg-orange-900 border-l-4 border-orange-500"
		if (line.includes("🟡")) return "bg-yellow-900 border-l-4 border-yellow-500"
		if (line.includes("🔵")) return "bg-blue-900 border-l-4 border-blue-500"
		return "bg-gray-800"
	}

	const handleCopyReport = () => {
		if (finalContent) {
			navigator.clipboard.writeText(finalContent)
		}
	}

	const handleExportReport = () => {
		if (finalContent) {
			const blob = new Blob([finalContent], { type: "text/markdown" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `code-review-report-${new Date().toISOString().split("T")[0]}.md`
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
		}
	}

	return (
		<div className="bg-gray-900 border border-gray-700 rounded-lg p-6 my-4">
			{/* 工具栏 */}
			<div className="flex justify-between items-center mb-6">
				<div className="flex items-center space-x-2">
					<span className="text-2xl">🔍</span>
					<h3 className="text-lg font-semibold text-white">代码审查报告</h3>
					{path && <span className="text-sm text-gray-400 bg-gray-800 px-2 py-1 rounded">{path}</span>}
				</div>
				{!loading && !error && finalContent && (
					<div className="flex space-x-2">
						<VSCodeButton onClick={handleCopyReport} appearance="secondary" title="复制报告到剪贴板">
							📋 复制
						</VSCodeButton>
						<VSCodeButton onClick={handleExportReport} appearance="secondary" title="导出为Markdown文件">
							📄 导出
						</VSCodeButton>
					</div>
				)}
			</div>

			{/* 报告内容 */}
			<div className="space-y-1">{renderContent()}</div>

			{/* 底部信息 */}
			{!loading && !error && finalContent && (
				<div className="mt-6 pt-4 border-t border-gray-700 text-sm text-gray-500">
					<p>💡 提示：点击上方按钮可以复制或导出完整的审查报告</p>
				</div>
			)}
		</div>
	)
}

export default CodeReviewResult
