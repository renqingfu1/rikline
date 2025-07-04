import { Controller, EnableProviderRequest, EnableProviderResponse } from "../../../shared/proto/third_party_code_review"

/**
 * Enables or disables a third-party code review provider.
 */
export async function enableProvider(controller: Controller, request: EnableProviderRequest): Promise<EnableProviderResponse> {
	// TODO: Implement provider enable/disable logic
	return EnableProviderResponse.create({
		success: true,
	})
}
