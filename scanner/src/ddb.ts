import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	QueryCommand,
	UpdateCommand,
	type DeleteCommandInput,
	type GetCommandInput,
	type PutCommandInput,
	type QueryCommandInput,
	type UpdateCommandInput
} from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.AWS_ENDPOINT_URL;
const region = process.env.AWS_REGION ?? 'ap-northeast-1';

export const TABLE = process.env.VIGIL_TABLE_NAME ?? 'vigil';

let cached: DynamoDBDocumentClient | undefined;

export function getDdb(): DynamoDBDocumentClient {
	if (cached) return cached;
	const raw = new DynamoDBClient({
		region,
		...(endpoint
			? { endpoint, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }
			: {})
	});
	cached = DynamoDBDocumentClient.from(raw, {
		marshallOptions: { removeUndefinedValues: true }
	});
	return cached;
}

export const getItem = (input: Omit<GetCommandInput, 'TableName'>) =>
	getDdb().send(new GetCommand({ TableName: TABLE, ...input }));

export const putItem = (input: Omit<PutCommandInput, 'TableName'>) =>
	getDdb().send(new PutCommand({ TableName: TABLE, ...input }));

export const queryItems = (input: Omit<QueryCommandInput, 'TableName'>) =>
	getDdb().send(new QueryCommand({ TableName: TABLE, ...input }));

export const updateItem = (input: Omit<UpdateCommandInput, 'TableName'>) =>
	getDdb().send(new UpdateCommand({ TableName: TABLE, ...input }));

export const deleteItem = (input: Omit<DeleteCommandInput, 'TableName'>) =>
	getDdb().send(new DeleteCommand({ TableName: TABLE, ...input }));
