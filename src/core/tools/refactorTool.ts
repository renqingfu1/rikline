import { ToolDefinition } from "@core/prompts/model_prompts/jsonToolToXml"

export const refactorToolDefinition: ToolDefinition = {
	name: "Refactor",
	descriptionForAgent: `自动化重构工具，支持多种代码重构操作。该工具可以帮助改善代码结构、提高可读性和可维护性，同时保持功能不变。

支持的重构操作：
- rename: 重命名变量、函数、类、方法等
- extract_method: 从现有代码中提取方法
- extract_variable: 提取变量或常量
- inline_variable: 内联变量
- move_code: 移动代码块到其他位置
- extract_interface: 从类中提取接口
- add_parameter: 为函数添加参数
- remove_parameter: 移除函数参数
- change_signature: 修改函数签名
- split_class: 拆分大类为多个小类
- merge_classes: 合并相关的小类

使用此工具前，请确保：
1. 目标文件存在且可访问
2. 重构操作不会破坏代码的语义和功能
3. 对于复杂的重构，建议先运行相关测试确保安全性`,
	inputSchema: {
		type: "object",
		properties: {
			file_path: {
				type: "string",
				description: "要重构的文件路径（绝对路径）",
			},
			operation: {
				type: "string",
				enum: [
					"rename",
					"extract_method",
					"extract_variable",
					"inline_variable",
					"move_code",
					"extract_interface",
					"add_parameter",
					"remove_parameter",
					"change_signature",
					"split_class",
					"merge_classes",
				],
				description: "要执行的重构操作类型",
			},
			target: {
				type: "string",
				description: "重构的目标（如要重命名的标识符名称、要提取的代码块等）",
			},
			new_name: {
				type: "string",
				description: "新名称（用于rename操作）",
			},
			start_line: {
				type: "integer",
				description: "起始行号（从1开始，用于extract_method、move_code等操作）",
			},
			end_line: {
				type: "integer",
				description: "结束行号（从1开始，用于extract_method、move_code等操作）",
			},
			destination_file: {
				type: "string",
				description: "目标文件路径（用于move_code、extract_interface等操作）",
			},
			destination_line: {
				type: "integer",
				description: "目标位置行号（用于move_code操作）",
			},
			method_name: {
				type: "string",
				description: "提取的方法名称（用于extract_method操作）",
			},
			variable_name: {
				type: "string",
				description: "变量名称（用于extract_variable、inline_variable操作）",
			},
			parameters: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: {
							type: "string",
							description: "参数名称",
						},
						type: {
							type: "string",
							description: "参数类型",
						},
						default_value: {
							type: "string",
							description: "默认值（可选）",
						},
					},
					required: ["name", "type"],
				},
				description: "参数列表（用于add_parameter、change_signature操作）",
			},
			interface_name: {
				type: "string",
				description: "接口名称（用于extract_interface操作）",
			},
			class_names: {
				type: "array",
				items: {
					type: "string",
				},
				description: "类名列表（用于split_class、merge_classes操作）",
			},
			preview_only: {
				type: "boolean",
				description: "是否仅预览重构结果而不实际执行（默认false）",
			},
			preserve_comments: {
				type: "boolean",
				description: "是否保留注释（默认true）",
			},
			update_references: {
				type: "boolean",
				description: "是否自动更新所有引用（默认true）",
			},
		},
		required: ["file_path", "operation", "target"],
	},
}
