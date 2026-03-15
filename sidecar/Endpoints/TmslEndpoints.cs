using Tabularcraft.Sidecar.Models;
using Tabularcraft.Sidecar.Services;

namespace Tabularcraft.Sidecar.Endpoints;

public static class TmslEndpoints
{
    public static void MapTmslEndpoints(this WebApplication app)
    {
        app.MapPost("/tmsl/execute", (TmslExecuteRequest request, AasConnectionService svc) =>
        {
            try
            {
                var result = svc.ExecuteTmsl(request.Script);
                return Results.Ok(new TmslExecuteResponse(result));
            }
            catch (Exception ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }
}
