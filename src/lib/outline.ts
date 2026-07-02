import https from "https";

/**
 * Fetches per-key byte transfer metrics from an Outline server.
 * Returns a map of { keyId -> bytesTransferred }.
 * Resolves to an empty object on any error so callers don't need try/catch.
 */
export async function fetchOutlineMetrics(
  apiUrl: string
): Promise<Record<string, number>> {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${apiUrl}/metrics/transfer`);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "GET",
        rejectUnauthorized: false,
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.bytesTransferredByUserId || {});
          } catch {
            resolve({});
          }
        });
      });
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({});
      });
      req.on("error", () => resolve({}));
      req.end();
    } catch {
      resolve({});
    }
  });
}

/**
 * Creates a new access key on an Outline server via its Management API.
 */
export async function createOutlineKey(
  apiUrl: string,
  keyName: string
): Promise<{ id: string; accessUrl: string }> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${apiUrl}/access-keys`);
      const body = JSON.stringify({ name: keyName });

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ id: String(json.id), accessUrl: json.accessUrl });
            } else {
              reject(new Error(`Outline API error: ${data}`));
            }
          } catch {
            reject(new Error("Failed to parse Outline API response"));
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Deletes an access key from an Outline server via its Management API.
 * Silently succeeds even if the key doesn't exist on the server.
 */
export async function deleteOutlineKey(
  apiUrl: string,
  keyId: string
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const cleanUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
      const url = new URL(`${cleanUrl}/access-keys/${keyId}`);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "DELETE",
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400 && res.statusCode !== 404) {
             console.error(`Outline API delete failed with status ${res.statusCode}:`, data);
          }
          resolve();
        });
      });

      req.on("error", (err) => {
        console.error("Outline API delete request error:", err);
        resolve();
      });
      
      // Add timeout to prevent hanging requests
      req.setTimeout(5000, () => {
        console.error("Outline API delete request timed out");
        req.destroy();
        resolve();
      });
      
      req.end();
    } catch (err) {
      console.error("Outline API delete exception:", err);
      resolve();
    }
  });
}

/**
 * Sets a data limit for an access key.
 */
export async function setOutlineDataLimit(
  apiUrl: string,
  keyId: string,
  limitBytes: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${apiUrl}/access-keys/${keyId}/data-limit`);
      const body = JSON.stringify({ limit: { bytes: limitBytes } });

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      });

      req.on("error", (e) => reject(e));
      req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Removes the data limit for an access key.
 */
export async function removeOutlineDataLimit(
  apiUrl: string,
  keyId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${apiUrl}/access-keys/${keyId}/data-limit`);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "DELETE",
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      });

      req.on("error", (e) => reject(e));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Fetches all access keys from an Outline server.
 */
export async function fetchOutlineKeys(
  apiUrl: string
): Promise<{ id: string; name: string }[]> {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${apiUrl}/access-keys`);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "GET",
        rejectUnauthorized: false,
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json.accessKeys || []);
            } else {
              resolve([]);
            }
          } catch {
            resolve([]);
          }
        });
      });

      req.on("error", () => resolve([]));
      req.end();
    } catch (e) {
      resolve([]);
    }
  });
}
