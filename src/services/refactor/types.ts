export interface RefactorOperation {
	operation: string
	target: string
	filePath: string
	newName?: string
	startLine?: number
	endLine?: number
	destinationFile?: string
	destinationLine?: number
	methodName?: string
	variableName?: string
	parameters?: Array<{ name: string; type: string; defaultValue?: string }>
	interfaceName?: string
	classNames?: string[]
	previewOnly?: boolean
	preserveComments?: boolean
	updateReferences?: boolean
}

export interface RefactorResult {
	success: boolean
	message: string
	preview?: string
	changes?: Array<{
		file: string
		originalContent: string
		modifiedContent: string
		description: string
	}>
	warnings?: string[]
	errors?: string[]
}

export interface RefactorChange {
	file: string
	originalContent: string
	modifiedContent: string
	description: string
}

export type RefactorOperationType =
	| "rename"
	| "extract_method"
	| "extract_variable"
	| "inline_variable"
	| "move_code"
	| "extract_interface"
	| "add_parameter"
	| "remove_parameter"
	| "change_signature"
	| "split_class"
	| "merge_classes"
