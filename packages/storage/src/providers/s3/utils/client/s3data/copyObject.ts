// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
	Endpoint,
	HttpRequest,
	HttpResponse,
	parseMetadata,
} from '@aws-amplify/core/internals/aws-client-utils';
import { AmplifyUrl } from '@aws-amplify/core/internals/utils';
import { composeServiceApi } from '@aws-amplify/core/internals/aws-client-utils/composers';

import {
	assignStringVariables,
	bothNilOrEqual,
	buildStorageServiceError,
	parseXmlBody,
	parseXmlError,
	s3TransferHandler,
	serializeObjectConfigsToHeaders,
	serializePathnameObjectKey,
	validateS3RequiredParameter,
} from '../utils';
import { IntegrityError } from '../../../../../errors/IntegrityError';
import { validateObjectUrl } from '../../validateObjectUrl';

import type { CopyObjectCommandInput, CopyObjectCommandOutput } from './types';
import { defaultConfig } from './base';

export type CopyObjectInput = Pick<
	CopyObjectCommandInput,
	| 'Bucket'
	| 'CopySource'
	| 'Key'
	| 'MetadataDirective'
	| 'CacheControl'
	| 'ContentType'
	| 'ContentDisposition'
	| 'ContentLanguage'
	| 'Expires'
	| 'ACL'
	| 'Tagging'
	| 'Metadata'
	| 'CopySourceIfUnmodifiedSince'
	| 'CopySourceIfMatch'
>;

export type CopyObjectOutput = CopyObjectCommandOutput;

const copyObjectSerializer = async (
	input: CopyObjectInput,
	endpoint: Endpoint,
): Promise<HttpRequest> => {
	const headers = {
		...(await serializeObjectConfigsToHeaders(input)),
		...assignStringVariables({
			'x-amz-copy-source': input.CopySource,
			'x-amz-metadata-directive': input.MetadataDirective,
			'x-amz-copy-source-if-match': input.CopySourceIfMatch,
			'x-amz-copy-source-if-unmodified-since':
				input.CopySourceIfUnmodifiedSince?.toISOString(),
		}),
	};
	validateCopyObjectHeaders(input, headers);
	const url = new AmplifyUrl(endpoint.url.toString());
	validateS3RequiredParameter(!!input.Key, 'Key');
	url.pathname = serializePathnameObjectKey(url, input.Key);
	validateObjectUrl({
		bucketName: input.Bucket,
		key: input.Key,
		objectURL: url,
	});

	return {
		method: 'PUT',
		headers,
		url,
	};
};

export const validateCopyObjectHeaders = (
	input: CopyObjectInput,
	headers: Record<string, string>,
) => {
	const validations: boolean[] = [];

	validations.push(headers['x-amz-copy-source'] === input.CopySource);

	validations.push(
		bothNilOrEqual(
			input.MetadataDirective,
			headers['x-amz-metadata-directive'],
		),
	);
	validations.push(
		bothNilOrEqual(
			input.CopySourceIfMatch,
			headers['x-amz-copy-source-if-match'],
		),
	);
	validations.push(
		bothNilOrEqual(
			input.CopySourceIfUnmodifiedSince?.toISOString(),
			headers['x-amz-copy-source-if-unmodified-since'],
		),
	);

	if (validations.some(validation => !validation)) {
		throw new IntegrityError();
	}
};

const copyObjectDeserializer = async (
	response: HttpResponse,
): Promise<CopyObjectOutput> => {
	if (response.statusCode >= 300) {
		const error = (await parseXmlError(response)) as Error;
		throw buildStorageServiceError(error, response.statusCode);
	} else {
		await parseXmlBody(response);

		return {
			$metadata: parseMetadata(response),
		};
	}
};

export const copyObject = composeServiceApi(
	s3TransferHandler,
	copyObjectSerializer,
	copyObjectDeserializer,
	{ ...defaultConfig, responseType: 'text' },
);
