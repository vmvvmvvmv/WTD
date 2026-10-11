#!/bin/bash
# usage: up.sh <file_upload_id> <bearer_token> <file> <mime>
curl -s -X POST "https://api.notion.com/v1/mcp/file_uploads/$1/send" -H "authorization: Bearer $2" -F "file=@$3;type=$4" | grep -o '"status":"[a-z]*"\|"message":"[^"]*"'
