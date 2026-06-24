package app.pera.tracker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Periodic fallback so the widgets never go very stale (the live path is the
 *  in-app snapshot publisher + WidgetBridge.refresh). */
class WidgetRefreshWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        return try {
            refreshAllWidgets(applicationContext)
            Result.success()
        } catch (_: Throwable) {
            Result.success()
        }
    }
}

object WidgetRefreshScheduler {
    private const val WORK_NAME = "pera-widget-refresh"

    /** Enqueue an hourly refresh once; keeps the existing schedule if present. */
    fun ensureScheduled(context: Context) {
        val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(1, TimeUnit.HOURS).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
