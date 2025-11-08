async function fetchPage() {
    const body = { query, variables: { ...vars, first, skip } };
    let retries = 3; // Set the number of retries
    
    while (retries > 0) {
        try {
            const js = await post(endpoint, body);
            if (js.errors?.length) {
                const msg = JSON.stringify(js.errors);
                
                // Check for 'indexer not available' and retry if possible
                if (/indexer not available/i.test(msg) && retries > 1) {
                    console.error(`[Warning] GraphQL error: ${msg}. Retrying in 5 seconds...`);
                    await new Promise(res => setTimeout(res, 5000));
                    retries--;
                    continue;
                }

                // Handle other GraphQL errors (like bad field names)
                if (/Cannot query field|has no field/i.test(msg)) {
                    await printRootFields(endpoint);
                }
                throw new Error(`GraphQL error: ${msg}`);
            }
            const data = js.data || {};
            const key = Object.keys(data)[0];
            return key ? (data[key] || []) : [];
        } catch (e) {
            // Check for general HTTP/Network errors that might contain 'indexer not available'
            if (/indexer not available/i.test(e.message) && retries > 1) {
                console.error(`[Warning] Network error: ${e.message}. Retrying in 5 seconds...`);
                await new Promise(res => setTimeout(res, 5000));
                retries--;
                continue;
            }
            throw e; // Re-throw fatal or non-retriable errors
        }
    }
    throw new Error("Repeated 'indexer not available' errors, giving up."); // Error after exhausting retries
}
