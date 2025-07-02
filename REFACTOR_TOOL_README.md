# 重构工具功能说明

## 概述

Rikline 现在支持自动化重构工具，可以帮助改善代码结构、提高可读性和可维护性，同时保持功能不变。

## 支持的重构操作

### 1. 重命名 (rename)
重命名变量、函数、类、方法等标识符，并可选择性地更新所有引用。

**示例：**
```xml
<refactor>
<file_path>src/example.js</file_path>
<operation>rename</operation>
<target>oldVariableName</target>
<new_name>newVariableName</new_name>
<update_references>true</update_references>
</refactor>
```

### 2. 提取方法 (extract_method)
从现有代码中提取指定行范围的代码，创建一个新的方法。

**示例：**
```xml
<refactor>
<file_path>src/UserManager.js</file_path>
<operation>extract_method</operation>
<target>validation logic</target>
<method_name>validateUser</method_name>
<start_line>10</start_line>
<end_line>20</end_line>
</refactor>
```

### 3. 提取变量 (extract_variable)
将重复的表达式提取为变量。

**示例：**
```xml
<refactor>
<file_path>src/calculations.js</file_path>
<operation>extract_variable</operation>
<target>Math.PI * radius * radius</target>
<variable_name>circleArea</variable_name>
</refactor>
```

### 4. 内联变量 (inline_variable)
将变量的使用替换为其定义的值，并移除变量声明。

**示例：**
```xml
<refactor>
<file_path>src/constants.js</file_path>
<operation>inline_variable</operation>
<target>temporaryVariable</target>
</refactor>
```

### 5. 移动代码 (move_code)
将代码块从一个位置移动到另一个位置，可以是同一文件内或不同文件之间。

**示例：**
```xml
<refactor>
<file_path>src/utils.js</file_path>
<operation>move_code</operation>
<target>helper functions</target>
<start_line>50</start_line>
<end_line>65</end_line>
<destination_file>src/helpers.js</destination_file>
<destination_line>10</destination_line>
</refactor>
```

## 参数说明

### 必需参数
- `file_path`: 要重构的文件路径
- `operation`: 重构操作类型
- `target`: 重构目标（标识符名称、代码描述等）

### 可选参数
- `new_name`: 新名称（用于rename操作）
- `start_line`/`end_line`: 代码行范围（用于extract_method、move_code等）
- `destination_file`: 目标文件（用于move_code等）
- `destination_line`: 目标行号（用于move_code）
- `method_name`: 新方法名称（用于extract_method）
- `variable_name`: 变量名称（用于extract_variable、inline_variable）
- `preview_only`: 是否仅预览（默认false）
- `preserve_comments`: 是否保留注释（默认true）
- `update_references`: 是否更新引用（默认true）

## 使用注意事项

1. **文件访问**: 确保目标文件存在且可访问
2. **语义保持**: 重构操作不会破坏代码的语义和功能
3. **测试建议**: 对于复杂的重构，建议先运行相关测试确保安全性
4. **预览模式**: 可以使用`preview_only=true`先预览重构结果
5. **引用更新**: `update_references=true`会自动搜索并更新项目中的所有引用

## 扩展功能 (待实现)

以下功能接口已预留，但尚未完全实现：
- `extract_interface`: 从类中提取接口
- `add_parameter`: 为函数添加参数
- `remove_parameter`: 移除函数参数
- `change_signature`: 修改函数签名
- `split_class`: 拆分大类为多个小类
- `merge_classes`: 合并相关的小类

## 技术实现

重构工具基于以下技术实现：
- AST（抽象语法树）解析用于精确的代码分析
- 正则表达式用于快速文本匹配和替换
- 文件系统操作用于多文件重构
- 依赖分析用于引用更新

## 错误处理

工具会返回详细的错误信息，包括：
- 参数验证错误
- 文件访问错误
- 语法分析错误
- 重构执行错误

## 示例场景

### 重命名变量示例
```javascript
// 重构前
const usr = new User()
usr.getName()

// 重构后（重命名 usr 为 user）
const user = new User()
user.getName()
```

### 提取方法示例
```javascript
// 重构前
function processData(data) {
    if (!data || data.length === 0) {
        console.log("No data provided")
        return null
    }
    
    // 其他处理逻辑...
}

// 重构后（提取验证逻辑）
function processData(data) {
    if (!validateData(data)) {
        return null
    }
    
    // 其他处理逻辑...
}

function validateData(data) {
    if (!data || data.length === 0) {
        console.log("No data provided")
        return false
    }
    return true
}
```

这个重构工具大大提升了Rikline的代码编辑能力，使AI助手能够更智能地帮助开发者改善代码质量。 