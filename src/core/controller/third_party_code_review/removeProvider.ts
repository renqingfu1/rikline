import { Controller, RemoveProviderRequest, RemoveProviderResponse } from "../../../shared/proto/third_party_code_review"

/**
 * Removes a third-party code review provider configuration.
 */
export async function removeProvider(controller: Controller, request: RemoveProviderRequest): Promise<RemoveProviderResponse> {
	// TODO: Implement provider removal logic
	return RemoveProviderResponse.create({
		success: true,
	})
}
