-- wrk script for load testing the Rust web server
-- Usage: wrk -t12 -c400 -d30s -s wrk-script.lua http://localhost:8080

local counter = 1
local random = math.random

-- Setup function (called once per thread)
setup = function(thread)
    thread:set("id", counter)
    counter = counter + 1
end

-- Request function (called for each request)
request = function()
    local requests = {
        "/api/health",
        "/api/health/detailed", 
        "/api/metrics",
        "/api/system",
        "/api/health/ready"
    }
    
    local headers = {}
    headers["Content-Type"] = "application/json"
    
    -- Randomly select an endpoint
    local path = requests[random(1, #requests)]
    
    -- Occasionally test POST endpoints
    if random(1, 10) == 1 then
        local user_data = string.format([[{
            "email": "user_%d@example.com",
            "password": "password123",
            "first_name": "Test",
            "last_name": "User"
        }]], random(1, 10000))
        
        return wrk.format("POST", "/api/auth/register", headers, user_data)
    end
    
    return wrk.format("GET", path, headers)
end

-- Response function (called for each response)
response = function(status, headers, body)
    if status ~= 200 and status ~= 201 and status ~= 401 then
        print("Unexpected status: " .. status)
    end
end

-- Done function (called once at the end)
done = function(summary, latency, requests)
    io.write("------------------------------\n")
    io.write("Load Test Summary:\n")
    io.write("------------------------------\n")
    io.write(string.format("Requests:      %d\n", summary.requests))
    io.write(string.format("Duration:      %.2fs\n", summary.duration / 1000000))
    io.write(string.format("Req/sec:       %.2f\n", summary.requests / (summary.duration / 1000000)))
    io.write(string.format("Latency (avg): %.2fms\n", latency.mean / 1000))
    io.write(string.format("Latency (max): %.2fms\n", latency.max / 1000))
    io.write(string.format("Latency (99p): %.2fms\n", latency:percentile(99) / 1000))
    io.write(string.format("Errors:        %d (%.2f%%)\n", summary.errors.total, 
                          summary.errors.total / summary.requests * 100))
    io.write("------------------------------\n")
end