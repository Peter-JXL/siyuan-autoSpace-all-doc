# SiYuan Auto-Spacing Tool

This is a script tool for batch processing of automatically adding spaces to documents in SiYuan Notes (SiYuan). It can automatically retrieve all notebook and document IDs via the API and perform the `autoSpace` operation on each document.

## Features

- Automatically retrieves all notebook information  
- Recursively extracts all document IDs from the document tree  
- Processes documents in batches to avoid excessive operations  
- Supports configuration of request address, authentication token, and log directory  
- Automatically records detailed logs for debugging and tracking  

## Dependencies

- Node.js  
- `axios`: Used for sending HTTP requests  
- `fs` and `path`: Used for file and path operations  

## Configuration Options

The following parameters can be configured in `index.js`:

| Parameter Name  | Description                          | Default Value |
|-----------------|--------------------------------------|---------------|
| `BASE_URL`      | SiYuan API address                   | `http://127.0.0.1:6806` |
| `AUTH_TOKEN`    | SiYuan authentication token          | `Token xxxxxx` |
| `LOG_DIR`       | Log folder name                      | `logs` |
| `BATCH_SIZE`    | Number of documents processed per batch | `300` |
| `PAUSE_MINUTES` | Pause time between batches (in minutes) | `1` |

## Usage Instructions

1. Install dependencies:

   ```bash
   npm install axios
   ```

2. Modify the configuration options (e.g., `BASE_URL` and `AUTH_TOKEN`).  
3. Run the script:

   ```bash
   node index.js
   ```

4. Check the log files (located in the `logs` directory) to confirm execution results.

## Important Notes

- Ensure that the SiYuan service is running and that the API address and token are correctly configured.  
- If there are a large number of documents, the script will automatically process them in batches and pause between batches to avoid excessive operations.  
- Log files record all operations and error information for easy troubleshooting.  

## License

This project uses the MIT License. For details, please refer to the [LICENSE](LICENSE) file.