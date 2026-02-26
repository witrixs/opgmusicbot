import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { PlayerComponent } from './components/player/player.component';
import { QueueComponent } from './components/queue/queue.component';
import { LoaderComponent } from './components/loader/loader.component';
import { SkeletonComponent } from './components/skeleton/skeleton.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { ConfirmModalComponent } from './components/confirm-modal/confirm-modal.component';
import { LoginComponent } from './pages/login/login.component';
import { LoginSuccessComponent } from './pages/login-success/login-success.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { AuthGuard } from './auth/auth.guard';
import { AuthInterceptor } from './auth/auth.interceptor';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'login-success', component: LoginSuccessComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [AuthGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];

/**
 * Главный модуль приложения
 * Регистрирует все компоненты, модули и сервисы
 */
@NgModule({
  declarations: [
    AppComponent,
    PlayerComponent,
    QueueComponent,
    LoaderComponent,
    SkeletonComponent,
    SidebarComponent,
    ConfirmModalComponent,
    LoginComponent,
    LoginSuccessComponent,
    DashboardComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule, // Для анимаций
    FormsModule,
    ReactiveFormsModule, // Для работы с FormBuilder и FormGroup
    HttpClientModule, // HTTP запросы к backend
    RouterModule.forRoot(routes),
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
