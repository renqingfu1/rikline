import { Controller } from "../../../shared/proto/third_party_code_review"
import {
	UpdateThirdPartyReviewGlobalConfigRequest,
	UpdateThirdPartyReviewGlobalConfigResponse,
} from "../../../shared/proto/third_party_code_review"
import * as vscode from "vscode"

/**
 * 更新第三方代码审查的全局配置
 */
export async function updateThirdPartyReviewGlobalConfig(
	controller: Controller,
	request: UpdateThirdPartyReviewGlobalConfigRequest,
): Promise<UpdateThirdPartyReviewGlobalConfigResponse> {
	try {
		if (!request.config) {
			throw new Error("配置不能为空")
		}

		// 获取配置对象
		const config = vscode.workspace.getConfiguration("codeReview.thirdParty")

		// 更新配置
		await config.update("configuredProviders", request.config.configuredProviders, vscode.ConfigurationTarget.Global)
		await config.update("enabledProviders", request.config.enabledProviders, vscode.ConfigurationTarget.Global)

		return UpdateThirdPartyReviewGlobalConfigResponse.create({
			success: true,
		})
	} catch (error) {
		console.error("Failed to update third party review global config:", error)
		return UpdateThirdPartyReviewGlobalConfigResponse.create({
			success: false,
			errorMessage: error instanceof Error ? error.message : "更新配置失败",
		})
	}
}
