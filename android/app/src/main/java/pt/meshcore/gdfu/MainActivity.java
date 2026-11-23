package pt.meshcore.gdfu;

import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }

    // uiMode is in manifest configChanges (no recreate), so a night-mode switch while backgrounded
    // never reaches the WebView and prefers-color-scheme stays stale. Re-dispatch on resume.
    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().dispatchConfigurationChanged(getResources().getConfiguration());
        }
    }
}
