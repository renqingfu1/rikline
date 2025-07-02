import * as fs from "fs/promises"
import * as path from "path"
import { RefactorOperation, RefactorResult, RefactorChange } from "./types"

export class RefactorService {
	constructor(private cwd: string) {}

	async executeRefactor(operation: RefactorOperation): Promise<RefactorResult> {
		try {
			// 验证输入参数
			const validation = this.validateOperation(operation)
			if (!validation.valid) {
				return {
					success: false,
					message: `参数验证失败: ${validation.errors?.join(", ")}`,
					errors: validation.errors,
				}
			}

			// 检查文件是否存在
			const filePath = path.resolve(this.cwd, operation.filePath)
			const fileExists = await this.fileExists(filePath)
			if (!fileExists) {
				return {
					success: false,
					message: `文件不存在: ${operation.filePath}`,
					errors: [`文件不存在: ${operation.filePath}`],
				}
			}

			// 根据操作类型执行相应的重构
			switch (operation.operation) {
				case "rename":
					return await this.performRename(operation)
				case "extract_method":
					return await this.performExtractMethod(operation)
				case "extract_variable":
					return await this.performExtractVariable(operation)
				case "inline_variable":
					return await this.performInlineVariable(operation)
				case "move_code":
					return await this.performMoveCode(operation)
				case "extract_interface":
					return await this.performExtractInterface(operation)
				case "add_parameter":
					return await this.performAddParameter(operation)
				case "remove_parameter":
					return await this.performRemoveParameter(operation)
				case "change_signature":
					return await this.performChangeSignature(operation)
				case "split_class":
					return await this.performSplitClass(operation)
				case "merge_classes":
					return await this.performMergeClasses(operation)
				default:
					return {
						success: false,
						message: `不支持的重构操作: ${operation.operation}`,
						errors: [`不支持的重构操作: ${operation.operation}`],
					}
			}
		} catch (error) {
			return {
				success: false,
				message: `重构执行失败: ${error instanceof Error ? error.message : String(error)}`,
				errors: [error instanceof Error ? error.message : String(error)],
			}
		}
	}

	private validateOperation(operation: RefactorOperation): { valid: boolean; errors?: string[] } {
		const errors: string[] = []

		if (!operation.filePath) {
			errors.push("文件路径不能为空")
		}

		if (!operation.operation) {
			errors.push("操作类型不能为空")
		}

		if (!operation.target) {
			errors.push("目标不能为空")
		}

		// 针对特定操作的验证
		switch (operation.operation) {
			case "rename":
				if (!operation.newName) {
					errors.push("重命名操作需要提供新名称")
				}
				break
			case "extract_method":
				if (!operation.methodName || operation.startLine === undefined || operation.endLine === undefined) {
					errors.push("提取方法操作需要方法名称、起始行和结束行")
				}
				break
			case "extract_variable":
				if (!operation.variableName) {
					errors.push("提取变量操作需要变量名称")
				}
				break
			case "move_code":
				if (operation.startLine === undefined || operation.endLine === undefined) {
					errors.push("移动代码操作需要起始行和结束行")
				}
				break
		}

		return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath)
			return true
		} catch {
			return false
		}
	}

	private async readFile(filePath: string): Promise<string> {
		const absolutePath = path.resolve(this.cwd, filePath)
		return await fs.readFile(absolutePath, "utf-8")
	}

	private async writeFile(filePath: string, content: string): Promise<void> {
		const absolutePath = path.resolve(this.cwd, filePath)
		await fs.writeFile(absolutePath, content, "utf-8")
	}

	// 重命名操作
	private async performRename(operation: RefactorOperation): Promise<RefactorResult> {
		const content = await this.readFile(operation.filePath)
		const lines = content.split("\n")

		// 简单的正则替换（实际项目中应该使用AST解析）
		const targetRegex = new RegExp(`\\b${this.escapeRegex(operation.target)}\\b`, "g")
		let modifiedContent = content.replace(targetRegex, operation.newName!)

		const changes: RefactorChange[] = [
			{
				file: operation.filePath,
				originalContent: content,
				modifiedContent,
				description: `重命名 "${operation.target}" 为 "${operation.newName}"`,
			},
		]

		if (operation.previewOnly) {
			return {
				success: true,
				message: `预览: 将 "${operation.target}" 重命名为 "${operation.newName}"`,
				preview: modifiedContent,
				changes,
			}
		}

		// 如果需要更新引用，搜索其他文件
		if (operation.updateReferences) {
			const referencedFiles = await this.findReferences(operation.target, operation.filePath)
			for (const refFile of referencedFiles) {
				if (refFile !== operation.filePath) {
					const refContent = await this.readFile(refFile)
					const refModified = refContent.replace(targetRegex, operation.newName!)
					changes.push({
						file: refFile,
						originalContent: refContent,
						modifiedContent: refModified,
						description: `更新 "${refFile}" 中的引用`,
					})
					await this.writeFile(refFile, refModified)
				}
			}
		}

		await this.writeFile(operation.filePath, modifiedContent)

		return {
			success: true,
			message: `成功将 "${operation.target}" 重命名为 "${operation.newName}"`,
			changes,
		}
	}

	// 提取方法操作
	private async performExtractMethod(operation: RefactorOperation): Promise<RefactorResult> {
		const content = await this.readFile(operation.filePath)
		const lines = content.split("\n")

		const startLine = operation.startLine! - 1 // 转换为0基础索引
		const endLine = operation.endLine! - 1

		if (startLine >= lines.length || endLine >= lines.length || startLine > endLine) {
			return {
				success: false,
				message: "无效的行号范围",
				errors: ["无效的行号范围"],
			}
		}

		const extractedCode = lines.slice(startLine, endLine + 1)
		const indentation = this.getIndentation(lines[startLine])

		// 分析提取代码的变量依赖
		const dependencies = this.analyzeVariableDependencies(extractedCode.join("\n"))

		// 生成新方法
		const methodSignature = this.generateMethodSignature(operation.methodName!, dependencies)
		const newMethod = this.generateMethod(methodSignature, extractedCode, indentation)

		// 替换原始代码为方法调用
		const methodCall = `${indentation}${this.generateMethodCall(operation.methodName!, dependencies)}`

		// 修改原文件
		const modifiedLines = [
			...lines.slice(0, startLine),
			methodCall,
			...lines.slice(endLine + 1),
			"",
			...newMethod.split("\n"),
		]

		const modifiedContent = modifiedLines.join("\n")

		const changes: RefactorChange[] = [
			{
				file: operation.filePath,
				originalContent: content,
				modifiedContent,
				description: `提取方法 "${operation.methodName}"`,
			},
		]

		if (operation.previewOnly) {
			return {
				success: true,
				message: `预览: 提取方法 "${operation.methodName}"`,
				preview: modifiedContent,
				changes,
			}
		}

		await this.writeFile(operation.filePath, modifiedContent)

		return {
			success: true,
			message: `成功提取方法 "${operation.methodName}"`,
			changes,
		}
	}

	// 提取变量操作
	private async performExtractVariable(operation: RefactorOperation): Promise<RefactorResult> {
		const content = await this.readFile(operation.filePath)

		// 查找目标表达式
		const targetRegex = new RegExp(this.escapeRegex(operation.target), "g")
		const matches = Array.from(content.matchAll(targetRegex))

		if (matches.length === 0) {
			return {
				success: false,
				message: `未找到目标表达式: ${operation.target}`,
				errors: [`未找到目标表达式: ${operation.target}`],
			}
		}

		// 在第一个匹配位置前添加变量声明
		const firstMatch = matches[0]
		const beforeMatch = content.substring(0, firstMatch.index!)
		const lines = beforeMatch.split("\n")
		const lastLineIndent = this.getIndentation(lines[lines.length - 1])

		const variableDeclaration = `${lastLineIndent}const ${operation.variableName} = ${operation.target};\n`

		// 替换所有出现的表达式为变量名
		let modifiedContent = content.replace(targetRegex, operation.variableName!)

		// 在第一个匹配位置前插入变量声明
		modifiedContent =
			modifiedContent.substring(0, firstMatch.index!) + variableDeclaration + modifiedContent.substring(firstMatch.index!)

		const changes: RefactorChange[] = [
			{
				file: operation.filePath,
				originalContent: content,
				modifiedContent,
				description: `提取变量 "${operation.variableName}"`,
			},
		]

		if (operation.previewOnly) {
			return {
				success: true,
				message: `预览: 提取变量 "${operation.variableName}"`,
				preview: modifiedContent,
				changes,
			}
		}

		await this.writeFile(operation.filePath, modifiedContent)

		return {
			success: true,
			message: `成功提取变量 "${operation.variableName}"`,
			changes,
		}
	}

	// 内联变量操作
	private async performInlineVariable(operation: RefactorOperation): Promise<RefactorResult> {
		const content = await this.readFile(operation.filePath)

		// 查找变量声明
		const declarationRegex = new RegExp(`(?:const|let|var)\\s+${this.escapeRegex(operation.target)}\\s*=\\s*([^;\\n]+)`, "g")
		const declarationMatch = declarationRegex.exec(content)

		if (!declarationMatch) {
			return {
				success: false,
				message: `未找到变量声明: ${operation.target}`,
				errors: [`未找到变量声明: ${operation.target}`],
			}
		}

		const variableValue = declarationMatch[1].trim()

		// 替换所有变量使用为其值
		const usageRegex = new RegExp(`\\b${this.escapeRegex(operation.target)}\\b`, "g")
		let modifiedContent = content.replace(usageRegex, variableValue)

		// 移除变量声明
		modifiedContent = modifiedContent.replace(declarationMatch[0], "")

		const changes: RefactorChange[] = [
			{
				file: operation.filePath,
				originalContent: content,
				modifiedContent,
				description: `内联变量 "${operation.target}"`,
			},
		]

		if (operation.previewOnly) {
			return {
				success: true,
				message: `预览: 内联变量 "${operation.target}"`,
				preview: modifiedContent,
				changes,
			}
		}

		await this.writeFile(operation.filePath, modifiedContent)

		return {
			success: true,
			message: `成功内联变量 "${operation.target}"`,
			changes,
		}
	}

	// 移动代码操作
	private async performMoveCode(operation: RefactorOperation): Promise<RefactorResult> {
		const sourceContent = await this.readFile(operation.filePath)
		const sourceLines = sourceContent.split("\n")

		const startLine = operation.startLine! - 1
		const endLine = operation.endLine! - 1

		if (startLine >= sourceLines.length || endLine >= sourceLines.length || startLine > endLine) {
			return {
				success: false,
				message: "无效的行号范围",
				errors: ["无效的行号范围"],
			}
		}

		const codeToMove = sourceLines.slice(startLine, endLine + 1)
		const remainingLines = [...sourceLines.slice(0, startLine), ...sourceLines.slice(endLine + 1)]

		const changes: RefactorChange[] = [
			{
				file: operation.filePath,
				originalContent: sourceContent,
				modifiedContent: remainingLines.join("\n"),
				description: `从 "${operation.filePath}" 移动代码`,
			},
		]

		// 如果指定了目标文件，移动到目标文件
		if (operation.destinationFile) {
			const destContent = await this.readFile(operation.destinationFile)
			const destLines = destContent.split("\n")

			const insertLine = operation.destinationLine ? operation.destinationLine - 1 : destLines.length
			const newDestLines = [...destLines.slice(0, insertLine), ...codeToMove, ...destLines.slice(insertLine)]

			changes.push({
				file: operation.destinationFile,
				originalContent: destContent,
				modifiedContent: newDestLines.join("\n"),
				description: `向 "${operation.destinationFile}" 添加移动的代码`,
			})

			if (!operation.previewOnly) {
				await this.writeFile(operation.destinationFile, newDestLines.join("\n"))
			}
		}

		if (operation.previewOnly) {
			return {
				success: true,
				message: "预览: 移动代码",
				changes,
			}
		}

		await this.writeFile(operation.filePath, remainingLines.join("\n"))

		return {
			success: true,
			message: "成功移动代码",
			changes,
		}
	}

	// 其他重构操作的占位符实现
	private async performExtractInterface(operation: RefactorOperation): Promise<RefactorResult> {
		return {
			success: false,
			message: "提取接口功能暂未实现",
			errors: ["提取接口功能暂未实现"],
		}
	}

	private async performAddParameter(operation: RefactorOperation): Promise<RefactorResult> {
		return {
			success: false,
			message: "添加参数功能暂未实现",
			errors: ["添加参数功能暂未实现"],
		}
	}

	private async performRemoveParameter(operation: RefactorOperation): Promise<RefactorResult> {
		return {
			success: false,
			message: "移除参数功能暂未实现",
			errors: ["移除参数功能暂未实现"],
		}
	}

	private async performChangeSignature(operation: RefactorOperation): Promise<RefactorResult> {
		return {
			success: false,
			message: "修改签名功能暂未实现",
			errors: ["修改签名功能暂未实现"],
		}
	}

	private async performSplitClass(operation: RefactorOperation): Promise<RefactorResult> {
		return {
			success: false,
			message: "拆分类功能暂未实现",
			errors: ["拆分类功能暂未实现"],
		}
	}

	private async performMergeClasses(operation: RefactorOperation): Promise<RefactorResult> {
		return {
			success: false,
			message: "合并类功能暂未实现",
			errors: ["合并类功能暂未实现"],
		}
	}

	// 辅助方法
	private escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	}

	private getIndentation(line: string): string {
		const match = line.match(/^(\s*)/)
		return match ? match[1] : ""
	}

	private analyzeVariableDependencies(code: string): string[] {
		// 简化的变量依赖分析
		const variables = new Set<string>()
		const variableRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g
		let match
		while ((match = variableRegex.exec(code)) !== null) {
			// 过滤掉关键字和常见的内置对象
			const variable = match[1]
			if (!this.isKeyword(variable)) {
				variables.add(variable)
			}
		}
		return Array.from(variables)
	}

	private isKeyword(word: string): boolean {
		const keywords = [
			"if",
			"else",
			"for",
			"while",
			"do",
			"switch",
			"case",
			"default",
			"function",
			"return",
			"var",
			"let",
			"const",
			"class",
			"extends",
			"import",
			"export",
			"from",
			"as",
			"true",
			"false",
			"null",
			"undefined",
			"this",
			"super",
			"new",
			"typeof",
			"instanceof",
			"in",
			"of",
		]
		return keywords.includes(word)
	}

	private generateMethodSignature(methodName: string, dependencies: string[]): string {
		const params = dependencies.length > 0 ? dependencies.join(", ") : ""
		return `${methodName}(${params})`
	}

	private generateMethod(signature: string, codeLines: string[], baseIndentation: string): string {
		const methodLines = [
			`${baseIndentation}private ${signature} {`,
			...codeLines.map((line) => `${baseIndentation}\t${line.replace(/^\s*/, "")}`),
			`${baseIndentation}}`,
		]
		return methodLines.join("\n")
	}

	private generateMethodCall(methodName: string, dependencies: string[]): string {
		const args = dependencies.length > 0 ? dependencies.join(", ") : ""
		return `this.${methodName}(${args});`
	}

	private async findReferences(target: string, currentFilePath?: string): Promise<string[]> {
		// 简化的引用查找实现
		// 在实际项目中，应该使用更精确的AST分析或Language Server Protocol
		const files: string[] = []

		try {
			const searchResult = await this.searchInDirectory(this.cwd, target)
			return searchResult
		} catch {
			return currentFilePath ? [currentFilePath] : [] // 如果搜索失败，至少返回当前文件
		}
	}

	private async searchInDirectory(dir: string, target: string): Promise<string[]> {
		const files: string[] = []
		const items = await fs.readdir(dir, { withFileTypes: true })

		for (const item of items) {
			const fullPath = path.join(dir, item.name)

			if (item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules") {
				const subFiles = await this.searchInDirectory(fullPath, target)
				files.push(...subFiles)
			} else if (item.isFile() && this.isCodeFile(item.name)) {
				try {
					const content = await fs.readFile(fullPath, "utf-8")
					if (content.includes(target)) {
						files.push(path.relative(this.cwd, fullPath))
					}
				} catch {
					// 忽略无法读取的文件
				}
			}
		}

		return files
	}

	private isCodeFile(filename: string): boolean {
		const extensions = [".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".cpp", ".c", ".h", ".cs", ".php", ".rb", ".go", ".rs"]
		return extensions.some((ext) => filename.endsWith(ext))
	}
}
