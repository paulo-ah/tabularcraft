using Tabularcraft.Sidecar.Services;

namespace Tabularcraft.Sidecar.Endpoints;

public static class ModelEndpoints
{
    public static void MapModelEndpoints(this WebApplication app)
    {
        app.MapGet("/model/databases", (AasConnectionService svc) =>
        {
            try
            {
                return Results.Ok(svc.GetDatabases());
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }
}
