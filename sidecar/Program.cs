using Tabularcraft.Sidecar.Endpoints;
using Tabularcraft.Sidecar.Services;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// In local extension-host runs, ASPNETCORE_URLS may be provided explicitly.
// Fallback to a random localhost port when no URL is configured.
if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
	builder.WebHost.UseUrls("http://127.0.0.1:0");
}

builder.Services.AddSingleton<AasConnectionService>();
builder.Services.ConfigureHttpJsonOptions(options =>
{
	// Accept enum values as strings in JSON payloads from the VS Code extension.
	options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

var app = builder.Build();

// Register all endpoint groups
app.MapConnectionEndpoints();
app.MapModelEndpoints();
app.MapProcessEndpoints();
app.MapMeasureEndpoints();
app.MapTmslEndpoints();

// Health check used by the extension to verify the sidecar is alive.
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

await app.StartAsync();

// Print the actual bound port so the extension can connect.
var address = app.Urls.First();
var port = new Uri(address).Port;
Console.WriteLine($"Listening on port {port}");
Console.Out.Flush();

await app.WaitForShutdownAsync();
