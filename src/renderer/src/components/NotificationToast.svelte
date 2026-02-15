<script>
    import { flip } from 'svelte/animate';
    import { fade, fly } from 'svelte/transition';
    import { notifications } from './NotificationStore';
    import { XIcon, CheckCircle, AlertCircle, Info } from 'lucide-svelte';

    // Auto-scroll to bottom if needed, but for fixed position it's just a stack.
</script>

<div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
    {#each $notifications as toast (toast.id)}
        <div
            animate:flip
            in:fly={{ y: 20, duration: 300 }}
            out:fade={{ duration: 200 }}
            class="pointer-events-auto min-w-[300px] max-w-md bg-[#242424] border border-[#3d3d3d] text-white p-4 rounded-lg shadow-xl flex items-start gap-3 relative overflow-hidden"
        >
            <!-- Progress/Time bar could be added here if desired -->
            
            <div class="flex-shrink-0 mt-0.5">
                {#if toast.type === 'success'}
                    <span class="text-green-500"><CheckCircle size={20} /></span>
                {:else if toast.type === 'error'}
                    <span class="text-red-500"><AlertCircle size={20} /></span>
                {:else}
                    <span class="text-blue-500"><Info size={20} /></span>
                {/if}
            </div>

            <div class="flex-1 mr-4">
                <p class="text-sm font-medium leading-5">{toast.message}</p>
            </div>

            <button 
                onclick={() => notifications.remove(toast.id)}
                class="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
            >
                <XIcon size={16} />
            </button> 
            
            <!-- Type-based border accent -->
            <div 
                class="absolute left-0 top-0 bottom-0 w-1"
                class:bg-green-500={toast.type === 'success'}
                class:bg-red-500={toast.type === 'error'}
                class:bg-blue-500={toast.type === 'info' || toast.type === 'default'}
            ></div>
        </div>
    {/each}
</div>
